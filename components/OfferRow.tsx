import type { Offer } from "@/lib/offers/types";
import { formatBRL } from "@/lib/format";

function Badge({ children, tone }: { children: React.ReactNode; tone: "green" | "blue" | "gray" | "amber" }) {
  const tones = {
    green: "bg-emerald-100 text-emerald-800",
    blue: "bg-sky-100 text-sky-800",
    gray: "bg-zinc-100 text-zinc-700",
    amber: "bg-amber-100 text-amber-800",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function OfferRow({ offer, position }: { offer: Offer; position: number }) {
  const inst = offer.installments;
  return (
    <li className="flex gap-3 border-b border-zinc-200 bg-white px-3 py-3 last:border-b-0 sm:px-4">
      <div className="w-6 shrink-0 pt-1 text-right text-xs text-zinc-400">{position}</div>

      {offer.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={offer.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded object-contain" loading="lazy" />
      ) : (
        <div className="h-16 w-16 shrink-0 rounded bg-zinc-100" />
      )}

      <div className="min-w-0 flex-1">
        <a
          href={offer.url}
          target="_blank"
          rel="noopener noreferrer nofollow sponsored"
          className="line-clamp-2 text-sm font-medium text-zinc-900 hover:underline"
        >
          {offer.title}
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600">
          <Badge tone="gray">{offer.sourceName}</Badge>
          {offer.sellerName && <span className="truncate">{offer.sellerName}</span>}
          {offer.isInternational === true && <Badge tone="amber">Internacional</Badge>}
          {offer.isInternational === false && <Badge tone="blue">Nacional</Badge>}
          {offer.freeShipping === true && <Badge tone="green">Frete grátis</Badge>}
          {offer.condition === "used" && <Badge tone="gray">Usado</Badge>}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-base font-semibold text-zinc-900">
          {formatBRL(offer.price)}
          {offer.cardPrice && <span className="ml-1 text-[11px] font-normal text-zinc-500">à vista</span>}
        </div>
        {offer.originalPrice && offer.originalPrice > offer.price && (
          <div className="text-xs text-zinc-400 line-through">{formatBRL(offer.originalPrice)}</div>
        )}
        {offer.cardPrice && <div className="text-xs text-zinc-600">{formatBRL(offer.cardPrice)} no cartão</div>}
        {inst && inst.count > 1 && (
          <div className={`text-xs ${inst.interestFree ? "text-emerald-700" : "text-zinc-500"}`}>
            {inst.count}x {formatBRL(inst.amount)} {inst.interestFree ? "sem juros" : "com juros"}
          </div>
        )}
        <a
          href={offer.url}
          target="_blank"
          rel="noopener noreferrer nofollow sponsored"
          className="mt-1 inline-block rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700"
        >
          Ver oferta
        </a>
      </div>
    </li>
  );
}
