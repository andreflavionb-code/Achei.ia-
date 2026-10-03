export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const { next = "/", erro } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <form method="POST" action="/api/login" className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Achei</h1>
        <p className="mt-1 text-sm text-zinc-600">Acesso restrito. Digite a senha.</p>
        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="password"
          required
          autoFocus
          placeholder="Senha"
          className="mt-4 w-full rounded-md border border-zinc-300 px-3 py-2"
        />
        {erro && <p className="mt-2 text-sm text-red-600">Senha incorreta.</p>}
        <button type="submit" className="mt-4 w-full rounded-md bg-zinc-900 py-2 font-medium text-white hover:bg-zinc-700">
          Entrar
        </button>
      </form>
    </main>
  );
}
