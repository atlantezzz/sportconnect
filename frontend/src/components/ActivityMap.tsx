"use client";

import dynamic from "next/dynamic";
import type { Activity } from "@/types/activity";

type Props = {
  activities: Activity[];
  selectedActivityId?: number | null;
  onActivityClick?: (id: number) => void;
  className?: string;
};

const LeafletActivityMap = dynamic(
  () => import("@/components/LeafletActivityMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-48 w-full items-center justify-center bg-[#edf1e9] text-sm text-gray-600">
        Kaart laden…
      </div>
    ),
  }
);

export default function ActivityMap(props: Props) {
  return <LeafletActivityMap {...props} />;
}
