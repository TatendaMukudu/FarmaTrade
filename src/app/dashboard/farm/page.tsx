import { redirect } from "next/navigation";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  LivestockForm,
  ProduceForm,
  EquipmentForm,
} from "./forms";
import { deleteLivestock, deleteProduce, deleteEquipment } from "./actions";

export default async function FarmPage() {
  const party = await getCurrentParty();
  if (!party?.farm) {
    redirect("/dashboard");
  }

  const [livestock, produce, equipment] = await Promise.all([
    prisma.livestock.findMany({
      where: { farmId: party.farm.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.produceStock.findMany({
      where: { farmId: party.farm.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.equipment.findMany({
      where: { farmId: party.farm.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold">{party.farm.farmName}</h1>
        <p className="text-sm text-gray-500">
          {party.district}, {party.province}
          {party.farm.sizeHectares ? ` · ${party.farm.sizeHectares} ha` : ""}
        </p>
      </div>

      <Section title="Livestock">
        <ul className="flex flex-col gap-2">
          {livestock.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded border px-4 py-2 text-sm"
            >
              <span>
                {l.quantity}x {l.species} ({l.sex})
                {l.breed ? ` · ${l.breed}` : ""}
                {l.notes ? ` · ${l.notes}` : ""}
              </span>
              <DeleteButton action={deleteLivestock} id={l.id} />
            </li>
          ))}
          {livestock.length === 0 && (
            <li className="text-sm text-gray-400">No livestock recorded yet.</li>
          )}
        </ul>
        <LivestockForm />
      </Section>

      <Section title="Produce">
        <ul className="flex flex-col gap-2">
          {produce.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded border px-4 py-2 text-sm"
            >
              <span>
                {p.quantity} {p.unit} {p.cropType}
                {p.perishable ? " · perishable" : ""}
                {p.notes ? ` · ${p.notes}` : ""}
              </span>
              <DeleteButton action={deleteProduce} id={p.id} />
            </li>
          ))}
          {produce.length === 0 && (
            <li className="text-sm text-gray-400">No produce recorded yet.</li>
          )}
        </ul>
        <ProduceForm />
      </Section>

      <Section title="Equipment">
        <ul className="flex flex-col gap-2">
          {equipment.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between rounded border px-4 py-2 text-sm"
            >
              <span>
                {e.name} ({e.category})
                {e.available ? " · available" : " · in use"}
                {e.condition ? ` · ${e.condition}` : ""}
              </span>
              <DeleteButton action={deleteEquipment} id={e.id} />
            </li>
          ))}
          {equipment.length === 0 && (
            <li className="text-sm text-gray-400">No equipment recorded yet.</li>
          )}
        </ul>
        <EquipmentForm />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}

function DeleteButton({
  action,
  id,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs text-red-600 underline">
        Remove
      </button>
    </form>
  );
}
