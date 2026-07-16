import { Suspense } from "react";
import InteriorScene from "@/components-v5/interior-scene";

// Single interior experience — opens straight into the one apartment.
// Node-id free: InteriorScene resolves the single configured apartment itself.
export default function Home() {
  return (
    <Suspense fallback={null}>
      <InteriorScene />
    </Suspense>
  );
}
