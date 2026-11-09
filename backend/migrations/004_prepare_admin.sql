CREATE TABLE cover_letters (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  resume_version_id BIGINT UNSIGNED NULL,
  company VARCHAR(150) NOT NULL,
  job_title VARCHAR(200) NOT NULL,
  job_description MEDIUMTEXT NOT NULL,
  tone VARCHAR(30) NOT NULL DEFAULT 'professional',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY ix_cl_user (user_id, deleted_at, updated_at),
  CONSTRAINT fk_cl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cl_version FOREIGN KEY (resume_version_id) REFERENCES resume_versions(id) ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE job_applications ADD CONSTRAINT fk_app_letter FOREIGN KEY (cover_letter_id)
  REFERENCES cover_letters(id) ON DELETE SET NULL;

CREATE TABLE cover_letter_versions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  cover_letter_id BIGINT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  source ENUM('ai','template','manual') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cl_version (cover_letter_id, version_no),
  CONSTRAINT fk_clv_letter FOREIGN KEY (cover_letter_id) REFERENCES cover_letters(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE linkedin_profiles (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  headline VARCHAR(300) NULL,
  about TEXT NULL,
  experience TEXT NULL,
  skills TEXT NULL,
  certifications TEXT NULL,
  education TEXT NULL,
  featured TEXT NULL,
  target_title VARCHAR(200) NULL,
  target_description MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_li_user (user_id),
  CONSTRAINT fk_li_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE linkedin_analyses (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  profile_id BIGINT UNSIGNED NOT NULL,
  score TINYINT UNSIGNED NOT NULL,
  rule_report JSON NOT NULL,
  ai_suggestions JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_lia_profile (profile_id, created_at),
  CONSTRAINT fk_lia_profile FOREIGN KEY (profile_id) REFERENCES linkedin_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE interview_questions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  category ENUM('behavioral','technical','hr','scenario','job_specific') NOT NULL,
  role_family VARCHAR(60) NOT NULL DEFAULT 'general',
  question VARCHAR(700) NOT NULL,
  guidance TEXT NULL,
  sample_answer TEXT NULL,
  source ENUM('bank','ai') NOT NULL DEFAULT 'bank',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_q_cat (category, role_family),
  KEY ix_q_user (user_id),
  CONSTRAINT fk_q_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE interview_sessions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  job_title VARCHAR(200) NULL,
  company VARCHAR(150) NULL,
  status ENUM('active','completed') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  KEY ix_is_user (user_id, created_at),
  CONSTRAINT fk_is_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE interview_answers (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  session_id BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  answer TEXT NULL,
  rule_feedback JSON NULL,
  ai_feedback JSON NULL,
  answered_at DATETIME NULL,
  UNIQUE KEY uq_session_question (session_id, question_id),
  CONSTRAINT fk_ia_session FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_ia_question FOREIGN KEY (question_id) REFERENCES interview_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('follow_up','interview','job_recommendation','resume_reminder','profile_reminder','system') NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(600) NULL,
  link VARCHAR(255) NULL,
  dedupe_key VARCHAR(120) NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notif_dedupe (user_id, dedupe_key),
  KEY ix_notif_user (user_id, read_at, created_at),
  KEY ix_notif_created (created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE subscription_plans (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(60) NOT NULL,
  price_cents INT UNSIGNED NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  limits JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE subscriptions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  plan_id INT UNSIGNED NOT NULL,
  status ENUM('active','cancelled','expired') NOT NULL DEFAULT 'active',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at DATETIME NULL,
  KEY ix_sub_user (user_id, status),
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
) ENGINE=InnoDB;

CREATE TABLE usage_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  feature VARCHAR(40) NOT NULL,
  is_ai TINYINT(1) NOT NULL DEFAULT 0,
  provider VARCHAR(40) NULL,
  model VARCHAR(80) NULL,
  input_tokens INT UNSIGNED NULL,
  output_tokens INT UNSIGNED NULL,
  cost_usd DECIMAL(10,6) NULL,
  status ENUM('ok','error','blocked') NOT NULL DEFAULT 'ok',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_usage_user (user_id, feature, created_at),
  KEY ix_usage_created (created_at, is_ai),
  CONSTRAINT fk_usage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  actor_id BIGINT UNSIGNED NULL,
  level ENUM('info','warn','error') NOT NULL DEFAULT 'info',
  action VARCHAR(80) NOT NULL,
  target VARCHAR(120) NULL,
  detail JSON NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_audit_created (created_at),
  KEY ix_audit_action (action),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE system_settings (
  setting_key VARCHAR(60) PRIMARY KEY,
  setting_value JSON NOT NULL,
  description VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
