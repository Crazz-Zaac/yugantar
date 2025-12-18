import { ENV } from "@/config/env";
// import { url } from "inspector";

const API_BASE = ENV.API_BASE;

export const authFetch = async (
    url: string,
    options: RequestInit = {}
): Promise<Response> => {
    const token = localStorage.getItem("access_token");
    return fetch(`${API_BASE}${url}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        },
    });
};

