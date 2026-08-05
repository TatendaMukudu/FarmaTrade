"use client";

import { useState } from "react";
import { LivestockForm, ProduceForm, EquipmentForm } from "./forms";
import { deleteLivestock, deleteProduce, deleteEquipment } from "./actions";
import type { Livestock, ProduceStock, Equipment } from "@/generated/prisma/client";

export function LivestockRow({ item }: { item: Livestock }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <LivestockForm initial={item} onDone={() => setEditing(false)} />;
  }
  return (
    <Row
      summary={
        <>
          {item.quantity}x {item.species} ({item.sex})
          {item.breed ? ` · ${item.breed}` : ""}
          {item.notes ? ` · ${item.notes}` : ""}
        </>
      }
      onEdit={() => setEditing(true)}
      deleteAction={deleteLivestock}
      id={item.id}
    />
  );
}

export function ProduceRow({ item }: { item: ProduceStock }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <ProduceForm initial={item} onDone={() => setEditing(false)} />;
  }
  return (
    <Row
      summary={
        <>
          {item.quantity} {item.unit} {item.cropType}
          {item.perishable ? " · perishable" : ""}
          {item.notes ? ` · ${item.notes}` : ""}
        </>
      }
      onEdit={() => setEditing(true)}
      deleteAction={deleteProduce}
      id={item.id}
    />
  );
}

export function EquipmentRow({ item }: { item: Equipment }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <EquipmentForm initial={item} onDone={() => setEditing(false)} />;
  }
  return (
    <Row
      summary={
        <>
          {item.name} ({item.category})
          {item.available ? " · available" : " · in use"}
          {item.condition ? ` · ${item.condition}` : ""}
        </>
      }
      onEdit={() => setEditing(true)}
      deleteAction={deleteEquipment}
      id={item.id}
    />
  );
}

function Row({
  summary,
  onEdit,
  deleteAction,
  id,
}: {
  summary: React.ReactNode;
  onEdit: () => void;
  deleteAction: (formData: FormData) => Promise<void>;
  id: string;
}) {
  return (
    <li className="flex items-center justify-between rounded border px-4 py-2 text-sm">
      <span>{summary}</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onEdit} className="text-xs underline">
          Edit
        </button>
        <form action={deleteAction}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="text-xs text-red-600 underline">
            Remove
          </button>
        </form>
      </div>
    </li>
  );
}
