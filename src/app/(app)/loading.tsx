import { SkeletonPlanilha } from "@/components/skeletons";

/**
 * Esqueleto genérico do grupo (app) — as rotas com forma própria têm o seu loading.tsx.
 * Ele também é a "casca" que o Next pré-carrega, o que faz a navegação funcionar offline.
 */
export default function Loading() {
  return <SkeletonPlanilha />;
}
