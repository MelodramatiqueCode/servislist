import { notFound } from "next/navigation";
import { PrevadzkaEditForm } from "@/components/prevadzka-edit-form";
import { devicesForPrevadzka, getPrevadzkaProfile } from "@/lib/store";

export default async function UpravitPrevadzkuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = await getPrevadzkaProfile(id);
  if (!store) notFound();
  const devices = await devicesForPrevadzka(store);
  const device = devices[0]
    ? {
        name: devices[0].name,
        deviceType: devices[0].deviceType,
        osVersion: devices[0].osVersion,
        supervisorVersion: devices[0].supervisorVersion,
        ipAddress: devices[0].ipAddress,
      }
    : null;

  return (
    <div className="shell detail-page max-w-5xl space-y-8">
      <PrevadzkaEditForm store={store} device={device} />
    </div>
  );
}
