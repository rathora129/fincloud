"use client";

import { useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, TableSkeleton } from "./states";
import { Button } from "./button";

export type DataTableProps<T> = {
  data: T[];
  columns: ColumnDef<T, any>[];
  getSearchText?: (row: T) => string;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  initialPageSize?: number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
  footer?: ReactNode;
  hideSearch?: boolean;
};

function pageList(current: number, total: number) {
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  return [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
}

export function DataTable<T extends object>({
  data,
  columns,
  getSearchText,
  searchPlaceholder = "Search records…",
  toolbar,
  initialPageSize = 10,
  loading = false,
  emptyTitle = "No matching records",
  emptyDescription = "Try adjusting your search or filters.",
  emptyAction,
  onRowClick,
  rowClassName,
  className,
  footer,
  hideSearch = false,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const needle = String(filterValue ?? "").trim().toLowerCase();
      if (!needle) return true;
      const haystack = getSearchText ? getSearchText(row.original) : JSON.stringify(row.original);
      return haystack.toLowerCase().includes(needle);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: initialPageSize, pageIndex: 0 } },
  });

  const rows = table.getRowModel().rows;
  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const totalRows = table.getFilteredRowModel().rows.length;
  const start = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min(totalRows, (pageIndex + 1) * pageSize);
  const pages = pageList(pageIndex + 1, Math.max(1, table.getPageCount()));

  return (
    <div className={cn("surface overflow-hidden rounded-2xl", className)}>
      <div className="flex flex-col gap-3 border-b border-ink-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        {!hideSearch ? (
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-9 w-full rounded-[10px] border border-ink-200 bg-white pl-8.5 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
              style={{ paddingLeft: "2.1rem" }}
            />
          </div>
        ) : (
          <div />
        )}
        {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      </div>

      {loading ? (
        <TableSkeleton cols={Math.min(6, columns.length)} />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-ink-100 bg-ink-50/70">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500"
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1.5 rounded transition hover:text-ink-800"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    "border-b border-ink-100/80 transition-colors last:border-0",
                    onRowClick ? "cursor-pointer hover:bg-brand-50/40" : "hover:bg-ink-50/50",
                    rowClassName?.(row.original),
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-4 py-3 text-ink-700">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-ink-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-[11px] text-ink-500">
            <span className="tabular">
              Showing <span className="font-medium text-ink-700">{start}</span>–
              <span className="font-medium text-ink-700">{end}</span> of{" "}
              <span className="font-medium text-ink-700">{totalRows}</span>
            </span>
            <select
              value={pageSize}
              onChange={(event) => table.setPageSize(Number(event.target.value))}
              aria-label="Rows per page"
              className="h-7 rounded-md border border-ink-200 bg-white px-1.5 text-[11px] text-ink-600 focus:border-brand-500 focus:outline-none"
            >
              {[8, 10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </div>
          {footer ? <div className="text-[11px] text-ink-500">{footer}</div> : null}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {pages.map((page, index) => {
              const previous = pages[index - 1];
              return (
                <span key={page} className="flex items-center gap-1">
                  {previous && page - previous > 1 ? <span className="px-1 text-ink-300">…</span> : null}
                  <button
                    type="button"
                    onClick={() => table.setPageIndex(page - 1)}
                    aria-current={page === pageIndex + 1 ? "page" : undefined}
                    className={cn(
                      "h-7 min-w-7 rounded-md px-1.5 text-[11px] font-medium tabular transition",
                      page === pageIndex + 1
                        ? "bg-brand-600 text-white"
                        : "text-ink-500 hover:bg-ink-100 hover:text-ink-800",
                    )}
                  >
                    {page}
                  </button>
                </span>
              );
            })}
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
