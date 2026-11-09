CREATE TABLE resumes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  category VARCHAR(60) NULL,
  origin ENUM('upload','builder','optimizer') NOT NULL DEFAULT 'upload',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  template VARCHAR(30) NOT NULL DEFAULT 'classic',
  current_version_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY ix_resume_user (user_id, deleted_at, updated_at),
  CONSTRAINT fk_resume_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE resume_versions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  resume_id BIGINT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  label VARCHAR(150) NULL,
  change_source ENUM('upload','manual','optimizer','builder') NOT NULL DEFAULT 'manual',
  raw_text MEDIUMTEXT NOT NULL,
  structured JSON NOT NULL,
  file_path VARCHAR(255) NULL,
  file_name VARCHAR(255) NULL,
  file_mime VARCHAR(120) NULL,
  file_size INT UNSIGNED NULL,
  format_signals JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_version_no (resume_id, version_no),
  CONSTRAINT fk_version_resume FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE resumes ADD CONSTRAINT fk_resume_current FOREIGN KEY (current_version_id)
  REFERENCES resume_versions(id) ON DELETE SET NULL;

CREATE TABLE resume_sections (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  version_id BIGINT UNSIGNED NOT NULL,
  section_type ENUM('personal','summary','experience','education','skills','certifications','projects','achievements','languages','other') NOT NULL,
  position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  content JSON NOT NULL,
  KEY ix_section_version (version_id, position),
  CONSTRAINT fk_section_version FOREIGN KEY (version_id) REFERENCES resume_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE resume_scans (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  resume_id BIGINT UNSIGNED NOT NULL,
  version_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NULL,
  company VARCHAR(150) NULL,
  job_title VARCHAR(150) NOT NULL,
  job_description MEDIUMTEXT NOT NULL,
  overall_score TINYINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_scan_user (user_id, created_at),
  KEY ix_scan_resume (resume_id),
  KEY ix_scan_created (created_at),
  CONSTRAINT fk_scan_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_scan_resume FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE,
  CONSTRAINT fk_scan_version FOREIGN KEY (version_id) REFERENCES resume_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE resume_scan_results (
  scan_id BIGINT UNSIGNED PRIMARY KEY,
  skills_score TINYINT UNSIGNED NOT NULL,
  keyword_score TINYINT UNSIGNED NOT NULL,
  experience_score TINYINT UNSIGNED NOT NULL,
  title_score TINYINT UNSIGNED NOT NULL,
  formatting_score TINYINT UNSIGNED NOT NULL,
  education_score TINYINT UNSIGNED NOT NULL,
  report JSON NOT NULL,
  rules_snapshot JSON NOT NULL,
  excluded_terms JSON NULL,
  CONSTRAINT fk_result_scan FOREIGN KEY (scan_id) REFERENCES resume_scans(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE resume_keywords (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  scan_id BIGINT UNSIGNED NOT NULL,
  term VARCHAR(100) NOT NULL,
  category ENUM('hard','soft','tool','certification','keyword') NOT NULL,
  status ENUM('matched','missing','recommended') NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  job_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  resume_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  KEY ix_kw_scan (scan_id, status),
  CONSTRAINT fk_kw_scan FOREIGN KEY (scan_id) REFERENCES resume_scans(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE resume_suggestions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  version_id BIGINT UNSIGNED NOT NULL,
  scan_id BIGINT UNSIGNED NULL,
  kind ENUM('summary','bullet','skill','keyword','grammar','content') NOT NULL,
  section_path VARCHAR(100) NOT NULL,
  original_text TEXT NULL,
  suggested_text TEXT NOT NULL,
  rationale VARCHAR(500) NULL,
  source ENUM('ai','rule') NOT NULL,
  needs_confirmation TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  final_text TEXT NULL,
  decided_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_sugg_version (user_id, version_id, status),
  CONSTRAINT fk_sugg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sugg_version FOREIGN KEY (version_id) REFERENCES resume_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sugg_scan FOREIGN KEY (scan_id) REFERENCES resume_scans(id) ON DELETE SET NULL
) ENGINE=InnoDB;
