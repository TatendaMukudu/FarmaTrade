import { redirect } from "next/navigation";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LivestockForm, ProduceForm, EquipmentForm } from "./forms";
import { LivestockRow, ProduceRow, EquipmentRow } from "./rows";
import { ImportForm } from "./import-form";

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

      <ImportForm />

      <Section title="Livestock">
        <ul className="flex flex-col gap-2">
          {livestock.map((l) => (
            <LivestockRow key={l.id} item={l} />
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
            <ProduceRow key={p.id} item={p} />
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
            <EquipmentRow key={e.id} item={e} />
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
