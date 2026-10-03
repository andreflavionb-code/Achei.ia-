/**
 * Links de afiliado do Mercado Livre.
 *
 * O Programa de Afiliados do ML identifica o afiliado pelos parâmetros
 * `matt_word` (seu identificador) e `matt_tool` (id da ferramenta), que o
 * gerador de links do painel de afiliados acrescenta às URLs.
 *
 * Não existe API pública para gerar os links curtos (mercadolivre.com/sec/...).
 * Por isso acrescentamos os parâmetros diretamente ao permalink do produto.
 *
 * IMPORTANTE: confira no painel de afiliados se os cliques gerados por aqui
 * estão sendo atribuídos. Se não estiverem, copie os parâmetros exatos de um
 * link gerado pelo painel e ajuste as variáveis de ambiente.
 */

export function toAffiliateUrl(permalink: string): string {
  const mattWord = process.env.ML_AFFILIATE_MATT_WORD?.trim();
  const mattTool = process.env.ML_AFFILIATE_MATT_TOOL?.trim();
  if (!mattWord) return permalink;

  try {
    const url = new URL(permalink);
    url.searchParams.set("matt_word", mattWord);
    if (mattTool) url.searchParams.set("matt_tool", mattTool);
    return url.toString();
  } catch {
    return permalink;
  }
}

export function isAffiliateConfigured(): boolean {
  return Boolean(process.env.ML_AFFILIATE_MATT_WORD?.trim());
}
