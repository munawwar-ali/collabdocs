import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-100", className)}
      aria-hidden="true"
    />
  );
}

export function DocumentCardSkeleton() {
  return (
    <div className="rounded-lg border bg-white p-5 space-y-3" aria-hidden="true">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 flex-1 max-w-[160px]" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-4" aria-hidden="true">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="pt-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6 mt-2" />
      </div>
    </div>
  );
}
