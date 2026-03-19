import { data } from "react-router";

export async function loader() {
  return data({ ok: true, route: "reserve" });
}

export async function action() {
  return data({ ok: true, route: "reserve action" });
}