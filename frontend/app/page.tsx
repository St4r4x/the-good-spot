import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock, Home, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Good Spot — trouvez où vivre à mi-chemin",
  description:
    "Deux lieux de travail, un temps de trajet max : découvrez la zone où habiter convient aux deux, en vrais temps de trajet (transports, marche, vélo, voiture).",
  openGraph: {
    title: "The Good Spot — trouvez où vivre à mi-chemin",
    description:
      "La zone où habiter convient à vos deux trajets domicile-travail, en vrais temps de trajet.",
    images: ["/app-preview.webp"],
  },
};

const STEPS = [
  {
    Icon: MapPin,
    title: "Vos deux lieux de travail",
    text: "Renseignez les deux adresses, un temps de trajet max et vos moyens de transport.",
  },
  {
    Icon: Clock,
    title: "La zone commune",
    text: "L'app calcule ce qui est réellement atteignable depuis chaque lieu et affiche l'intersection sur la carte.",
  },
  {
    Icon: Home,
    title: "Testez des logements",
    text: "Chaque adresse candidate est vérifiée : dans la zone ou non, avec le vrai temps de trajet vers chaque lieu.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-base font-semibold text-foreground">The Good Spot</span>
        <Link href="/app" className={cn(buttonVariants())}>
          Ouvrir la carte
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-12 text-center md:py-20">
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold text-foreground md:text-5xl">
            Trouvez où vivre à mi-chemin
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Deux lieux de travail, un temps de trajet max : découvrez la zone où
            habiter convient aux deux — en vrais temps de trajet, pas à vol
            d&apos;oiseau.
          </p>
          <Link href="/app" className={cn(buttonVariants({ size: "lg" }), "mt-8")}>
            Ouvrir la carte
          </Link>
          <div className="mt-12 overflow-hidden rounded-xl border border-border">
            {/* Pre-optimized WebP served as-is; no-img-element rule doesn't apply here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/app-preview.webp"
              width={1440}
              height={900}
              alt="L'application The Good Spot : deux zones de trajet autour de Paris et leur zone commune sur la carte, avec un logement testé dans le panneau"
              className="w-full"
            />
          </div>
        </section>

        <section className="py-12 md:py-16">
          <h2 className="text-center text-2xl font-semibold text-foreground">
            Comment ça marche
          </h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3">
            {STEPS.map(({ Icon, title, text }, i) => (
              <li key={title} className="text-center">
                <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon aria-hidden className="size-5" />
                </div>
                <h3 className="mt-3 font-semibold text-foreground">
                  {i + 1}. {title}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-border py-12 md:py-16">
          <ul className="mx-auto grid max-w-3xl gap-6 text-center text-sm text-muted-foreground md:grid-cols-3">
            <li>
              <strong className="block font-medium text-foreground">
                De vrais temps de trajet
              </strong>
              Isochrones et itinéraires calculés par Geoapify, pas une estimation à
              vol d&apos;oiseau.
            </li>
            <li>
              <strong className="block font-medium text-foreground">
                Synchronisé entre appareils
              </strong>
              Un compte gratuit garde vos lieux de travail et l&apos;historique de vos
              logements testés, partout où vous vous connectez.
            </li>
            <li>
              <strong className="block font-medium text-foreground">Gratuit</strong>
              Pensé pour une recherche de logement à deux, sans coût caché.
            </li>
          </ul>
        </section>

        <section className="border-t border-border py-14 text-center md:py-20">
          <h2 className="text-2xl font-semibold text-foreground">
            Prêts à chercher au bon endroit ?
          </h2>
          <Link href="/app" className={cn(buttonVariants({ size: "lg" }), "mt-6")}>
            Ouvrir la carte
          </Link>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 text-xs text-muted-foreground">
          <span>The Good Spot</span>
          <a
            href="https://github.com/St4r4x/the-good-spot"
            className="transition-colors duration-150 hover:text-primary motion-reduce:transition-none"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
