import { redirect } from "next/navigation";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LivestockForm } from "./livestock-form";
import { ProduceForm } from "./produce-form";
import { EquipmentForm } from "./equipment-form";
import { LivestockRow, ProduceRow, EquipmentRow } from "./rows";
import { ImportForm } from "./import-form";
import { AddToggle } from "@/components/add-toggle";

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
        <p className="text-sm text-muted-fg">
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
            <li className="text-sm text-subtle-fg">No livestock recorded yet.</li>
          )}
        </ul>
        <AddToggle label="Add livestock">
          <LivestockForm />
        </AddToggle>
      </Section>

      <Section title="Produce">
        <ul className="flex flex-col gap-2">
          {produce.map((p) => (
            <ProduceRow key={p.id} item={p} />
          ))}
          {produce.length === 0 && (
            <li className="text-sm text-subtle-fg">No produce recorded yet.</li>
          )}
        </ul>
        <AddToggle label="Add produce">
          <ProduceForm />
        </AddToggle>
      </Section>

      <Section title="Equipment">
        <ul className="flex flex-col gap-2">
          {equipment.map((e) => (
            <EquipmentRow key={e.id} item={e} />
          ))}
          {equipment.length === 0 && (
            <li className="text-sm text-subtle-fg">No equipment recorded yet.</li>
          )}
        </ul>
        <AddToggle label="Add equipment">
          <EquipmentForm />
        </AddToggle>
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
