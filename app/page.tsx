import { Suspense } from "react";
import { SearchPage } from "@/components/SearchPage";

export default function Home() {
  return (
    <main className="flex-1">
      <Suspense fallback={null}>
        <SearchPage />
      </Suspense>
    </main>
  );
}
