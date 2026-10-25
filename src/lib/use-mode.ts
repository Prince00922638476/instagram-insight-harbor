import { useQuery } from "@tanstack/react-query";
import { getMetaConfig } from "./meta.functions";

export function useMetaConfig() {
  return useQuery({ queryKey: ["meta-config"], queryFn: () => getMetaConfig(), staleTime: 60_000 });
}
