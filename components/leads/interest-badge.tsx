import { Badge } from "@/components/ui/badge";
import type { InterestStatus } from "@/lib/types";

export function InterestBadge({
  status,
}: {
  status: InterestStatus | null | undefined;
}) {
  if (status === "interested") {
    return <Badge tone="success">Interested</Badge>;
  }
  if (status === "not_interested") {
    return <Badge tone="danger">Not interested</Badge>;
  }
  return <Badge tone="warning">Pending</Badge>;
}
