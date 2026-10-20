import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-x flex min-h-[80svh] flex-col items-start justify-center">
      <p className="eyebrow">404</p>
      <h1 className="h-display mt-4 text-5xl">Page not found.</h1>
      <Link href="/" className="btn-ghost mt-10">Return home</Link>
    </div>
  );
}
