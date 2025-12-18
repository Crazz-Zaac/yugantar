export interface User {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  gender: "male" | "female" | "other";
  date_of_birth: string | null;
  is_verified: boolean;
  disabled: boolean;
  access_roles: string[];
  cooperative_roles: string[];
  joined_at: string;
  created_at: string;
  updated_at: string;
}



