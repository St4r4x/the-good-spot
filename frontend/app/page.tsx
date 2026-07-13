import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/landing-reveal";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Good Spot — trouvez où vivre à mi-chemin",
  description:
    "Deux trajets différents, une seule adresse qui convient aux deux — calculée sur de vrais temps de trajet, pas à vol d'oiseau.",
  openGraph: {
    title: "The Good Spot — trouvez où vivre à mi-chemin",
    description:
      "Deux trajets différents, une seule adresse qui convient aux deux — calculée sur de vrais temps de trajet.",
    images: ["/app-preview.webp"],
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#0b1220] text-[#f4f2ea]">
      {/* Ambient backdrop: layered radial glow, no imagery, pure CSS. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_20%_-10%,oklch(0.55_0.14_200_/_0.35),transparent),radial-gradient(ellipse_60%_40%_at_100%_20%,oklch(0.65_0.19_45_/_0.25),transparent)]"
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6 md:px-10">
        <span className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-[#f4f2ea]">
          <Image
            src="/logo-mark.png"
            alt=""
            width={861}
            height={248}
            className="h-7 w-auto brightness-0 invert"
          />
          The Good Spot
        </span>
        <Link
          href="/app"
          className={cn(
            buttonVariants(),
            "rounded-full border border-white/10 bg-white/10 text-[#f4f2ea] backdrop-blur-sm transition-colors duration-200 hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-[#ff8a5c]/50 motion-reduce:transition-none"
          )}
        >
          Ouvrir la carte
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 md:px-10">
        {/* HERO — asymmetric: oversized diagonal headline left, tilted screenshot bleeding off the right edge. */}
        <section className="relative grid gap-12 pt-10 pb-24 md:grid-cols-[1.15fr_1fr] md:gap-6 md:pt-16 md:pb-36">
          <Reveal className="relative md:-rotate-1">
            <span className="mb-5 inline-block rounded-full border border-[#ff8a5c]/40 bg-[#ff8a5c]/10 px-3 py-1 text-xs font-medium tracking-wide text-[#ffb08a] uppercase">
              Deux trajets, une seule adresse
            </span>
            <h1 className="text-[13vw] leading-[0.95] font-black tracking-tight text-balance sm:text-6xl md:text-7xl">
              Un chez-vous qui{" "}
              <span className="bg-gradient-to-r from-[#ff8a5c] via-[#ffb08a] to-[#5ce1c8] bg-clip-text text-transparent">
                convient à vous deux
              </span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-[#c8cddb]">
              Deux lieux de travail, deux trajets différents : trouvez la zone où
              habiter fonctionne pour vous deux, en vrais temps de trajet — pas à vol
              d&apos;oiseau.
            </p>
            <Link
              href="/app"
              className={cn(
                buttonVariants({ size: "lg" }),
                "group/cta mt-9 h-auto rounded-full bg-[#ff8a5c] px-7 py-3.5 text-base font-semibold text-[#0b1220] shadow-[0_0_0_0_rgba(255,138,92,0.5)] transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.03] hover:bg-[#ffb08a] hover:shadow-[0_8px_30px_-4px_rgba(255,138,92,0.55)] focus-visible:ring-3 focus-visible:ring-[#ff8a5c]/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100"
              )}
            >
              Trouvez votre lieu
              <span
                aria-hidden
                className="ml-1.5 inline-block transition-transform duration-300 group-hover/cta:translate-x-1 motion-reduce:transition-none"
              >
                →
              </span>
            </Link>
          </Reveal>

          <Reveal className="delay-150 md:mt-10">
            <div className="group relative mx-auto max-w-md md:mx-0 md:ml-auto md:mr-[-2.5rem] md:max-w-none md:translate-x-4">
              <div
                aria-hidden
                className="absolute -inset-3 -z-10 rotate-2 rounded-[1.75rem] bg-gradient-to-br from-[#5ce1c8]/40 to-[#ff8a5c]/30 blur-xl transition-opacity duration-500 group-hover:opacity-80 motion-reduce:transition-none"
              />
              <div className="overflow-hidden rounded-2xl border border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:rotate-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:rotate-0">
                <Image
                  src="/app-preview.webp"
                  width={1440}
                  height={900}
                  alt="L'application The Good Spot : deux zones de trajet autour de Paris et leur zone commune sur la carte, avec un logement testé dans le panneau"
                  className="w-full"
                  priority
                />
              </div>
            </div>
          </Reveal>
        </section>

        {/* RÉCIT — narrative block, offset from the grid, large pull-quote scale. */}
        <Reveal as="section" className="border-t border-white/10 py-20 md:py-28">
          <div className="md:ml-[8%] md:max-w-3xl">
            <p className="text-2xl leading-snug font-medium text-balance text-[#f4f2ea] md:text-4xl">
              Léa travaille dans le 9<sup>e</sup>, Karim dans le 15<sup>e</sup>.{" "}
              <span className="text-[#5ce1c8]">
                Trente minutes de trajet chacun, pas plus
              </span>{" "}
              — voilà toute la contrainte. The Good Spot calcule la zone où leurs deux
              trajets se rejoignent, puis vérifie chaque adresse de logement candidate
              contre les vrais temps de trajet, jusqu&apos;à trouver la bonne.
            </p>
          </div>
          <p className="mt-12 text-sm tracking-wide text-[#8b93a8] md:ml-[8%]">
            Vrais temps de trajet · Compte gratuit · Synchronisé partout
          </p>
        </Reveal>

        {/* CTA FINAL */}
        <Reveal
          as="section"
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#132036] via-[#0b1220] to-[#1a1030] px-8 py-16 text-center md:py-24"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_50%_100%,oklch(0.6_0.16_45_/_0.3),transparent)]"
          />
          <h2 className="relative text-3xl font-black tracking-tight text-balance md:text-5xl">
            Prêts à chercher au bon endroit ?
          </h2>
          <Link
            href="/app"
            className={cn(
              buttonVariants({ size: "lg" }),
              "relative mt-8 h-auto rounded-full bg-[#5ce1c8] px-7 py-3.5 text-base font-semibold text-[#0b1220] transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.03] hover:bg-[#8ff0dc] hover:shadow-[0_8px_30px_-4px_rgba(92,225,200,0.55)] focus-visible:ring-3 focus-visible:ring-[#5ce1c8]/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100"
            )}
          >
            Trouver notre zone commune
          </Link>
        </Reveal>
      </main>

      <footer className="relative z-10 border-t border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-[#8b93a8] md:px-10">
          <span>The Good Spot</span>
          <a
            href="https://github.com/St4r4x/the-good-spot"
            className="rounded-sm transition-colors duration-150 hover:text-[#5ce1c8] focus-visible:ring-3 focus-visible:ring-[#5ce1c8]/50 motion-reduce:transition-none"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
