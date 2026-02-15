import { useState } from "react"
import { Plus, Pencil, CheckCircle2, Clock, Search } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { policies } from "@/lib/data"
// TODO: Replace mock `policies` import with real API calls once a GET /api/v1/policies/ endpoint is available.
// Current backend has POST/PUT/DELETE for deposit & loan policies but no list-all endpoint.

export function PoliciesTab() {
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [editOpen, setEditOpen] = useState(false)

  const categories = [...new Set(policies.map((p) => p.category))]

  const filtered = policies.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = categoryFilter === "all" || p.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Policies</h2>
          <p className="text-sm text-muted-foreground">Manage cooperative rules, rates, and policies</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" />
              Add Policy
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Policy</DialogTitle>
              <DialogDescription>Create a new cooperative policy or rule</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium">Policy Title</Label>
                <Input placeholder="e.g. Maximum Savings Withdrawal" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium">Value</Label>
                  <Input placeholder="e.g. 50% of balance" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium">Category</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat.toLowerCase()}>{cat}</SelectItem>
                      ))}
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium">Description</Label>
                <Textarea placeholder="Explain the policy details..." className="min-h-[80px] resize-none" />
              </div>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                Save Policy
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Category Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        {categories.map((cat) => (
          <Card
            key={cat}
            className={`cursor-pointer transition-colors hover:bg-accent/50 ${categoryFilter === cat ? "border-primary bg-accent/50" : ""
              }`}
            onClick={() => setCategoryFilter(categoryFilter === cat ? "all" : cat)}
          >
            <CardContent className="flex flex-col items-center p-4">
              <p className="font-nums text-xl font-bold text-foreground">
                {policies.filter((p) => p.category === cat).length}
              </p>
              <p className="text-xs text-muted-foreground">{cat}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Policies Table */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">All Policies</CardTitle>
              <CardDescription>{filtered.length} policies</CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search policies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-64 pl-9 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Policy</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs">Value</TableHead>
                  <TableHead className="text-xs">Last Updated</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="w-10 text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell className="text-sm font-medium text-foreground">{policy.title}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{policy.category}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold text-foreground">{policy.value}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{policy.lastUpdated}</TableCell>
                    <TableCell>
                      {policy.status === "active" ? (
                        <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success text-xs">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-warning/30 bg-warning/10 text-warning text-xs">
                          <Clock className="h-3 w-3" />
                          Under Review
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Dialog open={editOpen} onOpenChange={setEditOpen}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${policy.title}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Edit Policy</DialogTitle>
                            <DialogDescription>Modify the policy details below</DialogDescription>
                          </DialogHeader>
                          <div className="flex flex-col gap-4 pt-2">
                            <div className="flex flex-col gap-2">
                              <Label className="text-xs font-medium">Policy Title</Label>
                              <Input defaultValue={policy.title} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Value</Label>
                                <Input defaultValue={policy.value} />
                              </div>
                              <div className="flex flex-col gap-2">
                                <Label className="text-xs font-medium">Status</Label>
                                <Select defaultValue={policy.status}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="under review">Under Review</SelectItem>
                                    <SelectItem value="deprecated">Deprecated</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setEditOpen(false)}>
                              Update Policy
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
