const HIGH_RISK_CATEGORIES = new Set(['Política', 'Saúde', 'Economia', 'Mundo']);
const HIGH_RISK_TERMS = /\b(eleic(?:ao|oes)|eleitoral|candidato|partido|presidente|ministro|governador|prefeito|congresso|senado|deputado|saude|doenca|medicamento|remedio|vacina|diagnostico|tratamento|hospital|morte|morto|morta|morreu|morrer|assassinato|homicidio|ferido|desaparecido|prisao|preso|suspeito|acusacao|crime|corrupcao|fraude|golpe|guerra|ataque|conflito|terrorismo|processo|tribunal|justica|judicial|banco|investimento|acoes|bolsa|inflacao|juros|taxa selic|mercado financeiro|desastre|enchente|incendio|sequestro|abuso|violencia|estupro|menor de idade|roubo|furto|assalto|acidente|atropelamento)\b/i;

export function assessAutomaticPublication({ article = {}, qualityReport = {}, evidence = [], now = Date.now() } = {}) {
  const reasons = [];
  const category = String(article.category || '');
  if (HIGH_RISK_CATEGORIES.has(category)) reasons.push(`A editoria ${category} exige revisão humana.`);

  const trusted = (evidence || []).filter(item => Number(item.trusted_for_auto_publish) === 1 &&
    /^https:\/\//i.test(String(item.source_url || '')) && String(item.source_summary || '').length >= 45);
  const domains = new Set();
  for (const item of trusted) {
    try { domains.add(new URL(item.source_url).hostname.toLowerCase().replace(/^www\./, '')); } catch {}
  }
  if (trusted.length < 2 || domains.size < 2) reasons.push('São necessárias duas fontes marcadas como confiáveis, de domínios diferentes.');

  const datedItems = trusted.map(item => ({
    domain: (() => { try { return new URL(item.source_url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } })(),
    publishedAt: Date.parse(item.source_published_at || '')
  })).filter(item => Number.isFinite(item.publishedAt));
  const datedDomains = new Set(datedItems.map(item => item.domain).filter(Boolean));
  if (datedItems.length < 2 || datedDomains.size < 2) {
    reasons.push('Duas fontes independentes precisam informar datas de publicação válidas.');
  } else if (datedItems.some(item => item.publishedAt > now + 12 * 60 * 60 * 1000 || now - item.publishedAt > 48 * 60 * 60 * 1000)) {
    reasons.push('As fontes não estão dentro da janela máxima de 48 horas.');
  }

  const allText = [article.title, article.excerpt, article.body,
    ...(evidence || []).flatMap(item => [item.source_title, item.source_summary])].join(' ');
  if (HIGH_RISK_TERMS.test(allText.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
    reasons.push('O tema contém termos de risco e foi encaminhado para revisão humana.');
  }

  if (qualityReport.sourceAgreement !== 'consistent') reasons.push('As fontes não foram classificadas como concordantes.');
  if ((qualityReport.warnings || []).length) reasons.push('Há alertas editoriais ainda não resolvidos.');
  if ((qualityReport.uncertaintyNotes || []).length) reasons.push('Há pontos de incerteza registrados pela IA.');
  if (!Number.isFinite(Number(qualityReport.confidenceScore)) || Number(qualityReport.confidenceScore) < 0.94) {
    reasons.push('A confiança estimada pela IA ficou abaixo de 94%.');
  }
  const keyFacts = Array.isArray(qualityReport.keyFacts) ? qualityReport.keyFacts : [];
  if (keyFacts.length < 3 || keyFacts.some(item =>
    !Number.isFinite(Number(item?.support)) || Number(item.support) < 0.55 ||
    !Number.isFinite(Number(item?.independentSourceSupport)) || Number(item.independentSourceSupport) < 2
  )) {
    reasons.push('Os três fatos-chave precisam de sustentação textual em pelo menos duas fontes independentes cada.');
  }
  const similarity = Number(qualityReport.similarityScore);
  if (!Number.isFinite(similarity) || similarity > 0.10) reasons.push('A similaridade não foi validada ou ficou acima do limite automático.');
  if (String(article.title || '').length < 12 || String(article.excerpt || '').length < 45 || String(article.body || '').length < 350) {
    reasons.push('A matéria não atingiu o tamanho mínimo editorial.');
  }

  return { allowed: reasons.length === 0, reasons, trustedSourceCount: trusted.length, independentDomainCount: domains.size, datedIndependentDomainCount: datedDomains.size };
}
