PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'Brasil',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_checked_at TEXT,
  last_error TEXT,
  trusted_for_auto_publish INTEGER NOT NULL DEFAULT 0 CHECK(trusted_for_auto_publish IN (0,1))
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_feed_url TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  source_title TEXT NOT NULL,
  source_summary TEXT NOT NULL DEFAULT '',
  source_published_at TEXT,
  source_count INTEGER NOT NULL DEFAULT 1,
  title TEXT,
  excerpt TEXT,
  body TEXT,
  category TEXT NOT NULL DEFAULT 'Brasil',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
  ai_status TEXT NOT NULL DEFAULT 'waiting' CHECK(ai_status IN ('waiting','ready','error','manual')),
  verification_status TEXT NOT NULL DEFAULT 'single-source' CHECK(verification_status IN ('single-source','multiple-sources')),
  quality_report TEXT,
  similarity_score REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  published_at TEXT,
  reviewed_at TEXT,
  auto_published INTEGER NOT NULL DEFAULT 0 CHECK(auto_published IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS article_evidence (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_summary TEXT NOT NULL DEFAULT '',
  source_published_at TEXT,
  collected_at TEXT NOT NULL,
  UNIQUE(article_id, source_url)
);

CREATE TABLE IF NOT EXISTS system_log (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS ai_daily_usage (
  usage_date TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0)
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,updated_at) VALUES
('auto_draft_enabled','0',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('auto_publish_enabled','0',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('automation_paused','0',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('ai_model','gemini-3.8-flash',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('ai_daily_limit','120',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('auto_publish_daily_limit','0',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('adsense_enabled','0',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('adsense_publisher_id','',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

CREATE INDEX IF NOT EXISTS idx_articles_status_created ON articles(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category, status);
CREATE INDEX IF NOT EXISTS idx_articles_category_created ON articles(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sources_active ON sources(active, last_checked_at);
CREATE INDEX IF NOT EXISTS idx_evidence_article ON article_evidence(article_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_created ON system_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_event_created ON system_log(event, created_at DESC);

-- Fontes de partida: confirme as condições de uso antes de manter cada uma ativa.
INSERT OR IGNORE INTO sources (id, name, url, category, active) VALUES
('src-agencia-brasil','Agência Brasil — últimas notícias','https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml','Brasil',1),
('src-agencia-esportes','Agência Brasil — esportes','https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml','Esportes',1),
('src-agencia-economia','Agência Brasil — economia','https://agenciabrasil.ebc.com.br/rss/economia/feed.xml','Economia',1),
('src-agencia-cultura','Agência Brasil — cultura','https://agenciabrasil.ebc.com.br/rss/cultura/feed.xml','Entretenimento',1),
('src-agencia-mundo','Agência Brasil — internacional','https://agenciabrasil.ebc.com.br/rss/internacional/feed.xml','Mundo',1),
('src-agencia-politica','Agência Brasil — política','https://agenciabrasil.ebc.com.br/rss/politica/feed.xml','Política',1),
('src-agencia-saude','Agência Brasil — saúde','https://agenciabrasil.ebc.com.br/rss/saude/feed.xml','Saúde',1),
('src-agencia-educacao','Agência Brasil — educação','https://agenciabrasil.ebc.com.br/rss/educacao/feed.xml','Ciência',1),
('src-nasa','NASA — notícias oficiais','https://www.nasa.gov/rss/dyn/breaking_news.rss','Ciência',1),
('src-senado','Agência Senado — notícias','https://www12.senado.leg.br/noticias/feed/todasnoticias/RSS','Política',1);


-- Audience analytics: random, first-party IDs only; no clear-text IP address is stored.
CREATE TABLE IF NOT EXISTS analytics_visitors (
  visitor_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analytics_pageviews (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  article_id TEXT,
  referrer_host TEXT NOT NULL DEFAULT '',
  device_type TEXT NOT NULL DEFAULT 'desktop',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analytics_adblock_detections (
  visitor_id TEXT NOT NULL,
  detected_date TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  PRIMARY KEY(visitor_id, detected_date)
);
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_created ON analytics_pageviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_visitor_path ON analytics_pageviews(visitor_id,path,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_article ON analytics_pageviews(article_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_adblock_date ON analytics_adblock_detections(detected_date DESC);
