import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/swimmers?test=1");
}