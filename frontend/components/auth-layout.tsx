import type { IllustrationProps } from "@/components/illustrations/types";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";

type AuthLayoutProps = {
  illustration: ComponentType<IllustrationProps>;
  caption: string;
  children: React.ReactNode;
};

export function AuthLayout({ illustration: Illustration, caption, children }: AuthLayoutProps) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-2">
      <div className="flex flex-col items-center gap-3 bg-primary/5 px-6 py-8 md:order-2 md:justify-center md:py-0">
        <Illustration className="h-24 w-auto text-primary md:h-48" />
        <p className="max-w-xs text-center text-sm text-muted-foreground">{caption}</p>
      </div>
      <div className="flex flex-col px-6 py-8 md:order-1 md:justify-center md:px-16">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Image src="/logo-mark.png" alt="" width={213} height={60} className="h-7 w-auto" />
          The Good Spot
        </Link>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
