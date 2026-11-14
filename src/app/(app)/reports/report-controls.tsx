"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { PRODUCT_LABELS } from "@/lib/labels";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { REPORT_CATALOG, type ReportKey } from "@/services/reports";

export function ReportControls({
  report,
  branches,
  values,
  supportsProduct,
}: {
  report: ReportKey;
  branches: { id: string; name: string }[];
  values: { from?: string; to?: string; branch?: string; product?: string };
  supportsProduct: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(values.from ?? "");
  const [to, setTo] = useState(values.to ?? "");
  const [branch, setBranch] = useState(values.branch ?? "");
  const [product, setProduct] = useState(values.product ?? "");

  const activeCount = [values.from, values.to, values.branch, supportsProduct ? values.product : undefined].filter(
    Boolean,
  ).length;

  const replace = (params: URLSearchParams) => {
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  };

  const apply = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("report", report);
    const entries: [string, string][] = [
      ["from", from],
      ["to", to],
      ["branch", branch],
      ["product", supportsProduct ? product : ""],
    ];
    entries.forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    replace(params);
  };

  const reset = () => {
    setFrom("");
    setTo("");
    setBranch("");
    setProduct("");
    const params = new URLSearchParams();
    params.set("report", report);
    replace(params);
  };

  return (
    <FilterBar activeCount={activeCount} onReset={reset} className="no-print">
      <FilterField label="Report">
        <Select
          value={report}
          onChange={(event) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("report", event.target.value);
            if (!REPORT_CATALOG.find((item) => item.key === event.target.value)?.supportsProduct) {
              params.delete("product");
            }
            replace(params);
          }}
          className="h-9 min-w-[12rem] text-[11.5px]"
        >
          {REPORT_CATALOG.map((item) => (
            <option key={item.key} value={item.key}>
              {item.title}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="From">
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => setFrom(event.target.value)}
          className="h-9 w-[9rem] px-2 text-[11px]"
          aria-label="From date"
        />
      </FilterField>

      <FilterField label="To">
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => setTo(event.target.value)}
          className="h-9 w-[9rem] px-2 text-[11px]"
          aria-label="To date"
        />
      </FilterField>

      {branches.length > 1 ? (
        <FilterField label="Branch">
          <Select
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            className="h-9 min-w-[10rem] text-[11.5px]"
          >
            <option value="">All branches</option>
            {branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </FilterField>
      ) : null}

      {supportsProduct ? (
        <FilterField label="Product">
          <Select
            value={product}
            onChange={(event) => setProduct(event.target.value)}
            className="h-9 min-w-[9rem] text-[11.5px]"
          >
            <option value="">All products</option>
            {Object.entries(PRODUCT_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
        </FilterField>
      ) : null}

      <Button size="sm" className="h-9" onClick={apply}>
        <Check className="h-3.5 w-3.5" /> Run report
      </Button>
    </FilterBar>
  );
}
