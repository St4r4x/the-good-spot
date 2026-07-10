export function Welcome() {
  return (
    <div className="border-b border-border px-4 pb-4">
      <h2 className="text-lg font-semibold text-foreground">
        Trouvez où vivre à mi-chemin
      </h2>
      <ol className="mt-2 flex flex-col gap-1.5 text-sm text-muted-foreground">
        <li>1. Renseignez vos deux adresses de travail</li>
        <li>2. Découvrez la zone atteignable depuis les deux</li>
        <li>3. Testez des adresses de logement candidates</li>
      </ol>
    </div>
  );
}
