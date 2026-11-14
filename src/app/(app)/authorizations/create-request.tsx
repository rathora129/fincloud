"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { AUTH_TYPE_LABELS } from "@/lib/labels";
import type { AuthorizationType } from "@/lib/types";
import { authorizationsService } from "@/services/authorizations";

const TYPES: AuthorizationType[] = ["PAYMENT", "LMS_ACCOUNT", "AGENCY"];

export function CreateAuthorizationButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AuthorizationType>("PAYMENT");
  const [title, setTitle] = useState("");
  const [entityName, setEntityName] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setType("PAYMENT");
    setTitle("");
    setEntityName("");
    setAmount("");
    setError(null);
  };

  const submit = async () => {
    setError(null);
    if (title.trim().length < 5) {
      setError("Request title needs at least 5 characters.");
      return;
    }
    if (entityName.trim().length < 3) {
      setError("Add the entity this request applies to.");
      return;
    }
    const parsedAmount = Number(amount);
    if (type === "PAYMENT" && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      setError("Payment requests need an amount greater than zero.");
      return;
    }
    setLoading(true);
    try {
      const result = await authorizationsService.create({
        type,
        title: title.trim(),
        entityName: entityName.trim(),
        amount: type === "PAYMENT" ? parsedAmount : null,
      });
      toast.success("Request raised", result.message);
      setOpen(false);
      reset();
      router.refresh();
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      toast.error("Could not raise request", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        size="md"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> Raise request
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!loading) setOpen(false);
        }}
        title="Raise authorization request"
        description="Submit a payment, LMS account or agency action for checker approval (DEMO)."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={submit} loading={loading}>
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label="Request type" htmlFor="auth-type" required>
            <Select
              id="auth-type"
              value={type}
              onChange={(event) => setType(event.target.value as AuthorizationType)}
            >
              {TYPES.map((item) => (
                <option key={item} value={item}>
                  {AUTH_TYPE_LABELS[item]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" htmlFor="auth-title" required>
            <Input
              id="auth-title"
              value={title}
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Disbursement payment release"
            />
          </Field>
          <Field
            label={type === "PAYMENT" ? "Beneficiary / entity" : type === "AGENCY" ? "Agency name" : "LMS entity"}
            htmlFor="auth-entity"
            required
          >
            <Input
              id="auth-entity"
              value={entityName}
              maxLength={160}
              onChange={(event) => setEntityName(event.target.value)}
              placeholder={type === "PAYMENT" ? "Beneficiary name" : "Account batch or agency name"}
            />
          </Field>
          {type === "PAYMENT" ? (
            <Field label="Amount (INR)" htmlFor="auth-amount" required>
              <Input
                id="auth-amount"
                type="number"
                min={1}
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="e.g. 500000"
              />
            </Field>
          ) : null}
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-800">
            DEMO only: raising a request does not trigger any payment, account mapping or agency empanelment.
          </p>
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">{error}</p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
