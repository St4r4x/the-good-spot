import { buttonVariants } from "@/components/ui/button";
import { JourneyIllustration } from "@/components/illustrations/journey";
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
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Image src="/logo-mark.png" alt="" width={861} height={248} className="h-7 w-auto" />
          The Good Spot
        </span>
        <Link href="/app" className={cn(buttonVariants())}>
          Ouvrir la carte
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="grid items-center gap-10 py-12 md:grid-cols-2 md:py-20">
          <div>
            <h1 className="text-4xl font-semibold text-foreground md:text-5xl">
              Un chez-vous qui convient à vous deux
            </h1>
            <p className="mt-4 max-w-md text-lg text-muted-foreground">
              Deux lieux de travail, deux trajets différents : trouvez la zone où
              habiter fonctionne pour vous deux, en vrais temps de trajet — pas à vol
              d&apos;oiseau.
            </p>
            <Link href="/app" className={cn(buttonVariants({ size: "lg" }), "mt-8")}>
              Ouvrir la carte
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <Image
              src="/app-preview.webp"
              width={1440}
              height={900}
              alt="L'application The Good Spot : deux zones de trajet autour de Paris et leur zone commune sur la carte, avec un logement testé dans le panneau"
              className="w-full"
            />
          </div>
        </section>

        <section className="border-t border-border py-12 md:py-16">
          <div className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-lg text-foreground">
                Léa travaille dans le 9<sup>e</sup>, Karim dans le 15<sup>e</sup>. Trente
                minutes de trajet chacun, pas plus — voilà toute la contrainte. The
                Good Spot calcule la zone où leurs deux trajets se rejoignent, puis
                vérifie chaque adresse de logement candidate contre les vrais temps de
                trajet, jusqu&apos;à trouver la bonne.
              </p>
            </div>
            <div className="flex justify-center">
              <JourneyIllustration className="h-24 w-auto text-primary/70 md:h-32" />
            </div>
          </div>
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Vrais temps de trajet · Compte gratuit · Synchronisé partout
          </p>
        </section>

        <section className="border-t border-border py-14 text-center md:py-20">
          <h2 className="text-2xl font-semibold text-foreground">
            Prêts à chercher au bon endroit ?
          </h2>
          <Link href="/app" className={cn(buttonVariants({ size: "lg" }), "mt-6")}>
            Trouver notre zone commune
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
