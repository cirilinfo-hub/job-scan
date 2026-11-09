CREATE TABLE companies (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  normalized VARCHAR(150) NOT NULL,
  website VARCHAR(255) NULL,
  logo_url VARCHAR(500) NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_company_norm (normalized)
) ENGINE=InnoDB;

CREATE TABLE job_categories (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE job_sources (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  homepage VARCHAR(255) NULL,
  attribution VARCHAR(255) NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 0,
  config JSON NULL,
  last_sync_at DATETIME NULL,
  last_sync_status VARCHAR(20) NULL,
  last_sync_message VARCHAR(500) NULL,
  last_sync_count INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE jobs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  source_id INT UNSIGNED NOT NULL,
  external_id VARCHAR(190) NOT NULL,
  company_id BIGINT UNSIGNED NULL,
  category_id INT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  description MEDIUMTEXT NOT NULL,
  summary VARCHAR(400) NULL,
  location VARCHAR(150) NULL,
  work_mode ENUM('remote','hybrid','onsite','unknown') NOT NULL DEFAULT 'unknown',
  employment_type ENUM('full_time','part_time','contract','internship','unknown') NOT NULL DEFAULT 'unknown',
  experience_level ENUM('intern','entry','mid','senior','lead','executive','unknown') NOT NULL DEFAULT 'unknown',
  min_years TINYINT UNSIGNED NULL,
  salary_min INT UNSIGNED NULL,
  salary_max INT UNSIGNED NULL,
  salary_currency CHAR(3) NULL,
  apply_url VARCHAR(1000) NULL,
  source_url VARCHAR(1000) NULL,
  is_demo TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  posted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_job_external (source_id, external_id),
  KEY ix_job_posted (is_active, posted_at),
  KEY ix_job_mode (work_mode, employment_type),
  KEY ix_job_level (experience_level),
  KEY ix_job_company (company_id),
  FULLTEXT KEY ft_job (title, description),
  CONSTRAINT fk_job_source FOREIGN KEY (source_id) REFERENCES job_sources(id),
  CONSTRAINT fk_job_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT fk_job_category FOREIGN KEY (category_id) REFERENCES job_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE resume_scans ADD CONSTRAINT fk_scan_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;

CREATE TABLE job_skills (
  job_id BIGINT UNSIGNED NOT NULL,
  skill_id INT UNSIGNED NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (job_id, skill_id),
  KEY ix_js_skill (skill_id),
  CONSTRAINT fk_js_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_js_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE job_matches (
  user_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  resume_version_id BIGINT UNSIGNED NULL,
  score TINYINT UNSIGNED NOT NULL,
  breakdown JSON NOT NULL,
  computed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, job_id),
  KEY ix_match_score (user_id, score),
  KEY ix_match_job (job_id),
  CONSTRAINT fk_match_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_version FOREIGN KEY (resume_version_id) REFERENCES resume_versions(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE saved_jobs (
  user_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, job_id),
  KEY ix_saved_job (job_id),
  KEY ix_saved_created (user_id, created_at),
  CONSTRAINT fk_saved_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE job_applications (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NULL,
  resume_version_id BIGINT UNSIGNED NULL,
  cover_letter_id BIGINT UNSIGNED NULL,
  company VARCHAR(150) NOT NULL,
  job_title VARCHAR(200) NOT NULL,
  location VARCHAR(150) NULL,
  salary VARCHAR(80) NULL,
  application_url VARCHAR(1000) NULL,
  job_description MEDIUMTEXT NULL,
  status ENUM('saved','applied','assessment','interview','offer','rejected') NOT NULL DEFAULT 'saved',
  position DECIMAL(16,4) NOT NULL DEFAULT 0,
  applied_at DATETIME NULL,
  follow_up_at DATETIME NULL,
  follow_up_notified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY ix_app_board (user_id, deleted_at, status, position),
  KEY ix_app_follow (follow_up_at, follow_up_notified_at),
  KEY ix_app_created (created_at),
  CONSTRAINT fk_app_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
  CONSTRAINT fk_app_version FOREIGN KEY (resume_version_id) REFERENCES resume_versions(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE application_status_history (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_hist_app (application_id, changed_at),
  KEY ix_hist_changed (to_status, changed_at),
  CONSTRAINT fk_hist_app FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE application_notes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_note_app (application_id, created_at),
  CONSTRAINT fk_note_app FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE interviews (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  scheduled_at DATETIME NOT NULL,
  kind VARCHAR(40) NOT NULL DEFAULT 'interview',
  location VARCHAR(255) NULL,
  notes TEXT NULL,
  reminded_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_int_app (application_id),
  KEY ix_int_sched (scheduled_at, reminded_at),
  CONSTRAINT fk_int_app FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB;
