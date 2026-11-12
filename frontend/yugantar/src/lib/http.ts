import { getLang } from "@/lib/i18n";
import { ENV } from "@/config/env";
import { getAccessToken } from "@/api/api";

const API_BASE = ENV.API_BASE;

export const authFetch = async (
    url: string,
    options: RequestInit = {}
): Promise<Response> => {
    const token = getAccessToken(); // in memory only, never localStorage
    return fetch(`${API_BASE}${url}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-Language": getLang(),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        },
    });
};

