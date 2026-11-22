CREATE TABLE IF NOT EXISTS parents_subs (
  email TEXT NOT NULL,
  birth_year INTEGER NOT NULL,
  sido TEXT NOT NULL,
  sigungu TEXT,
  src TEXT,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (email, birth_year)
);
CREATE TABLE IF NOT EXISTS parents_ev (day TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, k));
