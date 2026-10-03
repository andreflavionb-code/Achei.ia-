import type { Offer } from "./types";

/**
 * Modo preciso: esconde acessórios e itens que não correspondem ao produto
 * buscado. Os sites devolvem capas, cabos e carregadores junto com o
 * produto; aqui aplicamos três regras:
 *
 *  1. Todo termo específico da busca (marca, modelo, qualquer coisa com
 *     número) precisa aparecer no título. Palavras genéricas de categoria
 *     ("camera", "celular") não são exigidas, porque muitos títulos as omitem.
 *  2. Títulos com palavras típicas de acessório são escondidos, a menos que
 *     a própria busca contenha essa palavra (quem busca "capa iphone" quer capas).
 *  3. Preço muito abaixo do normal para o grupo (menos de 10% da mediana)
 *     é tratado como acessório que escapou das regras anteriores.
 */

const GENERIC_WORDS = new Set([
  "camera", "cameras", "celular", "celulares", "smartphone", "telefone", "notebook", "laptop", "computador",
  "pc", "tv", "televisao", "televisor", "monitor", "tablet", "relogio", "smartwatch", "fone", "fones",
  "headphone", "headset", "caixa", "som", "impressora", "geladeira", "fogao", "microondas", "lavadora",
  "console", "videogame", "placa", "video", "filmadora", "lente", "objetiva", "novo", "nova", "original",
  "de", "da", "do", "das", "dos", "para", "com", "sem", "e", "o", "a", "os", "as", "em", "um", "uma",
]);

const ACCESSORY_WORDS = [
  "capa", "capinha", "case", "pelicula", "protetor", "protetora", "protecao", "cabo", "carregador", "bateria",
  "baterias", "suporte", "tripe", "adaptador", "cage", "gaiola", "bolsa", "mochila", "estojo", "limpeza",
  "microfone", "cartao", "filtro", "parasol", "alca", "punho", "grip", "gimbal", "estabilizador",
  "controle", "fonte", "dummy", "dock", "hub", "vidro", "skin", "adesivo", "strap", "correia", "tampa",
  "mount", "plate", "rig", "handle", "clamp", "braco", "extensor", "conversor", "leitor", "pecas", "peca",
  "reposicao", "manual", "kit de", "flash", "luz", "led", "iluminador", "cinta", "tela de", "lcd", "visor",
  "fita", "parafuso", "anel", "cobertura", "kit limpeza", "sensor de", "pilha", "pilhas",
];

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Junta pares curtos "letras + dígitos" separados por hífen/espaço: "fx 3" -> "fx3". */
function mergeModelTokens(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (b && a.length + b.length <= 6 && ((/^[a-z]+$/.test(a) && /^\d+$/.test(b)) || (/^\d+$/.test(a) && /^[a-z]+$/.test(b)))) {
      out.push(a + b);
      i++;
    } else {
      out.push(a);
    }
  }
  return out;
}

export function specificTokens(query: string): string[] {
  const words = normalize(query).split(" ").filter(Boolean);
  return mergeModelTokens(words).filter((t) => t.length >= 2 && (/\d/.test(t) || !GENERIC_WORDS.has(t)));
}

function titleWords(title: string): Set<string> {
  const words = title.split(" ").filter(Boolean);
  const set = new Set(words);
  // "fx-3" vira "fx 3" na normalização; aceitamos também a forma colada.
  for (const merged of mergeModelTokens(words)) set.add(merged);
  return set;
}

function matchesQuery(title: string, tokens: string[]): boolean {
  const words = titleWords(title);
  return tokens.every((t) => words.has(t));
}

function looksLikeAccessory(title: string, queryNorm: string, tokens: string[]): boolean {
  for (const word of ACCESSORY_WORDS) {
    if (queryNorm.includes(word)) continue;
    const re = new RegExp(`(^|\\s)${word}(\\s|$)`);
    if (re.test(title)) return true;
  }
  // "para Sony FX3", "compatível com Sony FX3": quase sempre acessório.
  if (tokens.length > 0) {
    const alt = tokens.join("|");
    if (new RegExp(`(^|\\s)(para|p|compativel com|compativel)\\s+(\\w+\\s+){0,3}(${alt})(\\s|$)`).test(title)) return true;
  }
  return false;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface RelevanceResult {
  kept: Offer[];
  hidden: Offer[];
}

export function applyRelevance(offers: Offer[], query: string): RelevanceResult {
  const tokens = specificTokens(query);
  const queryNorm = normalize(query);
  const kept: Offer[] = [];
  const hidden: Offer[] = [];

  for (const offer of offers) {
    const title = normalize(offer.title);
    if (!matchesQuery(title, tokens) || looksLikeAccessory(title, queryNorm, tokens)) hidden.push(offer);
    else kept.push(offer);
  }

  if (kept.length >= 5) {
    const med = median(kept.map((o) => o.price));
    const floor = med * 0.1;
    const still: Offer[] = [];
    for (const offer of kept) {
      if (offer.price < floor) hidden.push(offer);
      else still.push(offer);
    }
    return { kept: still, hidden };
  }
  return { kept, hidden };
}
