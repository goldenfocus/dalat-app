import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl: string;
  className?: string;
}

/**
 * Generate page numbers to display with ellipsis.
 * Shows: 1 ... 4 5 [6] 7 8 ... 12
 */
function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [];

  // Always show first page
  pages.push(1);

  // Calculate range around current page
  const rangeStart = Math.max(2, current - 1);
  const rangeEnd = Math.min(total - 1, current + 1);

  // Add ellipsis if there's a gap after page 1
  if (rangeStart > 2) {
    pages.push("ellipsis");
  }

  // Add pages in the range
  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i);
  }

  // Add ellipsis if there's a gap before last page
  if (rangeEnd < total - 1) {
    pages.push("ellipsis");
  }

  // Always show last page
  if (total > 1) {
    pages.push(total);
  }

  return pages;
}

function getPageUrl(baseUrl: string, page: number): string {
  return page === 1 ? baseUrl : `${baseUrl}/${page}`;
}

export function Pagination({
  currentPage,
  totalPages,
  baseUrl,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-1", className)}
    >
      {/* Previous button */}
      {currentPage > 1 ? (
        <Link
          href={getPageUrl(baseUrl, currentPage - 1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground active:scale-95 transition-all"
          aria-label="Go to previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
      ) : (
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background opacity-50 cursor-not-allowed">
          <ChevronLeft className="h-4 w-4" />
        </span>
      )}

      {/* Page numbers */}
      {pageNumbers.map((page, index) => {
        if (page === "ellipsis") {
          return (
            <span
              key={`ellipsis-${index}`}
              className="inline-flex h-9 w-9 items-center justify-center"
              aria-hidden
            >
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </span>
          );
        }

        const isActive = page === currentPage;
        return (
          <Link
            key={page}
            href={getPageUrl(baseUrl, page)}
            className={cn(
              "inline-flex h-9 min-w-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-all active:scale-95",
              isActive
                ? "bg-primary text-primary-foreground shadow"
                : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
            )}
            aria-label={`Go to page ${page}`}
            aria-current={isActive ? "page" : undefined}
          >
            {page}
          </Link>
        );
      })}

      {/* Next button */}
      {currentPage < totalPages ? (
        <Link
          href={getPageUrl(baseUrl, currentPage + 1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground active:scale-95 transition-all"
          aria-label="Go to next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background opacity-50 cursor-not-allowed">
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}
