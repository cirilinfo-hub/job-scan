type S = [name: string, type: 'hard' | 'soft' | 'tool' | 'certification', aliases?: string[]];

export const SKILLS: S[] = [
  ['JavaScript', 'hard', ['js', 'ecmascript']], ['TypeScript', 'hard', ['ts']], ['Python', 'hard'], ['Java', 'hard'], ['C#', 'hard', ['csharp', 'c sharp']], ['C++', 'hard', ['cpp']], ['Go', 'hard', ['golang']],
  ['Rust', 'hard'], ['PHP', 'hard'], ['Ruby', 'hard'], ['Kotlin', 'hard'], ['Swift', 'hard'], ['Scala', 'hard'], ['R', 'hard', ['r programming']], ['SQL', 'hard'], ['NoSQL', 'hard'], ['HTML', 'hard', ['html5']], ['CSS', 'hard', ['css3']], ['SCSS', 'hard', ['sass']],
  ['Angular', 'hard', ['angularjs', 'angular.js']], ['React', 'hard', ['react.js', 'reactjs']], ['Vue', 'hard', ['vue.js', 'vuejs']], ['Next.js', 'hard', ['nextjs']], ['Node.js', 'hard', ['nodejs', 'node']], ['Express', 'hard', ['express.js', 'expressjs']], ['NestJS', 'hard'],
  ['Django', 'hard'], ['Flask', 'hard'], ['FastAPI', 'hard'], ['Spring Boot', 'hard', ['spring']], ['.NET', 'hard', ['dotnet', 'asp.net']], ['Laravel', 'hard'], ['Ruby on Rails', 'hard', ['rails']], ['REST APIs', 'hard', ['rest', 'restful', 'rest api']], ['GraphQL', 'hard'], ['gRPC', 'hard'],
  ['Microservices', 'hard'], ['MySQL', 'tool'], ['PostgreSQL', 'tool', ['postgres']], ['MongoDB', 'tool'], ['Redis', 'tool'], ['Elasticsearch', 'tool'], ['Kafka', 'tool'], ['RabbitMQ', 'tool'], ['AWS', 'tool', ['amazon web services']], ['Azure', 'tool'], ['Google Cloud', 'tool', ['gcp']],
  ['Docker', 'tool'], ['Kubernetes', 'tool', ['k8s']], ['Terraform', 'tool'], ['Ansible', 'tool'], ['Jenkins', 'tool'], ['GitHub Actions', 'tool'], ['CI/CD', 'hard', ['continuous integration', 'continuous delivery']], ['Git', 'tool'], ['Linux', 'tool'], ['Bash', 'tool', ['shell scripting']],
  ['Machine Learning', 'hard', ['ml']], ['Deep Learning', 'hard'], ['NLP', 'hard', ['natural language processing']], ['PyTorch', 'tool'], ['TensorFlow', 'tool'], ['Pandas', 'tool'], ['NumPy', 'tool'], ['Spark', 'tool', ['apache spark']], ['Airflow', 'tool'], ['dbt', 'tool'], ['Snowflake', 'tool'], ['Tableau', 'tool'], ['Power BI', 'tool'], ['Excel', 'tool', ['microsoft excel']], ['Looker', 'tool'],
  ['Data Analysis', 'hard'], ['Data Modeling', 'hard'], ['ETL', 'hard'], ['Statistics', 'hard'], ['A/B Testing', 'hard'], ['Unit Testing', 'hard'], ['Test Automation', 'hard'], ['Selenium', 'tool'], ['Cypress', 'tool'], ['Playwright', 'tool'], ['Jest', 'tool'], ['System Design', 'hard'], ['Agile', 'hard', ['scrum', 'kanban']], ['Jira', 'tool'],
  ['Product Management', 'hard'], ['Project Management', 'hard'], ['Product Strategy', 'hard'], ['Roadmapping', 'hard', ['roadmap']], ['User Research', 'hard'], ['UX Design', 'hard', ['user experience']], ['UI Design', 'hard'], ['Figma', 'tool'], ['Wireframing', 'hard'], ['Prototyping', 'hard'],
  ['SEO', 'hard', ['search engine optimization']], ['Content Marketing', 'hard'], ['Google Analytics', 'tool'], ['Email Marketing', 'hard'], ['Paid Media', 'hard', ['ppc', 'google ads']], ['Salesforce', 'tool'], ['HubSpot', 'tool'], ['CRM', 'hard'], ['Lead Generation', 'hard'], ['Account Management', 'hard'], ['Customer Success', 'hard'],
  ['Financial Modeling', 'hard'], ['Budgeting', 'hard'], ['Forecasting', 'hard'], ['Accounting', 'hard'], ['Recruiting', 'hard', ['talent acquisition']], ['Cybersecurity', 'hard', ['information security']], ['Penetration Testing', 'hard'], ['Networking', 'hard'],
  ['Communication', 'soft', ['communication skills']], ['Leadership', 'soft'], ['Teamwork', 'soft', ['team player']], ['Collaboration', 'soft', ['collaborative']], ['Problem Solving', 'soft', ['problem-solving']], ['Critical Thinking', 'soft'], ['Time Management', 'soft'], ['Adaptability', 'soft'], ['Attention to Detail', 'soft', ['detail-oriented', 'detail oriented']], ['Mentoring', 'soft', ['mentorship']], ['Stakeholder Management', 'soft'], ['Presentation Skills', 'soft', ['presentation']], ['Negotiation', 'soft'], ['Creativity', 'soft'], ['Ownership', 'soft'],
  ['AWS Certified Solutions Architect', 'certification'], ['PMP', 'certification', ['project management professional']], ['CISSP', 'certification'], ['Scrum Master', 'certification', ['csm', 'certified scrum master']], ['CPA', 'certification'],
];

export const JOB_SOURCES = [
  { code: 'remotive', name: 'Remotive', homepage: 'https://remotive.com', attribution: 'Listings provided by Remotive, delayed by 24 hours. Applications continue on Remotive.' },
  { code: 'arbeitnow', name: 'Arbeitnow', homepage: 'https://www.arbeitnow.com', attribution: 'Listings provided by Arbeitnow.' },
  { code: 'adzuna', name: 'Adzuna', homepage: 'https://www.adzuna.com', attribution: 'Jobs by Adzuna.' },
];

export const PLANS = [
  { code: 'free', name: 'Free', price: 0, limits: { resumes: 5, scans_per_month: 20, uploads_per_month: 20, ai_calls_per_month: 10 } },
  { code: 'pro', name: 'Pro', price: 1900, limits: { resumes: 50, scans_per_month: 500, uploads_per_month: 200, ai_calls_per_month: 300 } },
  { code: 'unlimited', name: 'Unlimited', price: 0, limits: { resumes: -1, scans_per_month: -1, uploads_per_month: -1, ai_calls_per_month: -1 } },
];

type Q = [category: 'behavioral' | 'technical' | 'hr' | 'scenario', family: string, question: string, guidance: string, sample: string];

const STAR_SAMPLE = 'Situation: [one sentence of context]. Task: [what you needed to achieve]. Action: [the steps you took personally]. Result: [the outcome, with a real figure if you have one].';

export const QUESTIONS: Q[] = [
  ['behavioral', 'general', 'Tell me about a time you had to deal with a difficult colleague or stakeholder.', 'Show that you listened, stayed professional and moved the work forward. Avoid blaming.', STAR_SAMPLE],
  ['behavioral', 'general', 'Describe a project that failed or missed its goal. What did you learn?', 'Choose a real failure, own your part, and focus on what you changed afterward.', STAR_SAMPLE],
  ['behavioral', 'general', 'Tell me about a time you led without formal authority.', 'Explain how you built agreement and what changed because of it.', STAR_SAMPLE],
  ['behavioral', 'general', 'Give an example of when you had to learn something quickly.', 'Show how you learn: what you prioritised, who you asked, and how soon you applied it.', STAR_SAMPLE],
  ['behavioral', 'general', 'Describe a time you received critical feedback.', 'Show that you took it seriously, and describe the specific change you made.', STAR_SAMPLE],
  ['behavioral', 'general', 'Tell me about a time you had to manage competing priorities.', 'Explain how you decided, who you told, and what you dropped or delayed.', STAR_SAMPLE],
  ['hr', 'general', 'Tell me about yourself.', 'Keep it to about two minutes: present role, relevant past, and why this job now.', 'I currently [role and focus]. Before that, I [relevant experience]. I am interested in this role because [specific reason].'],
  ['hr', 'general', 'Why do you want to work here?', 'Refer to something specific about the company and link it to what you want to do.', 'I noticed that [specific fact about the company]. That matters to me because [reason], and my experience in [area] would help with [need].'],
  ['hr', 'general', 'What are your salary expectations?', 'Research the market first. Give a range you can support, and show flexibility on the total package.', 'Based on my research and experience, I am looking for [range], and I am open to discussing the full package.'],
  ['hr', 'general', 'Why are you leaving your current job?', 'Stay positive and focus on what you are moving toward.', 'I have learned a lot in [area]. I am now looking for [what this role offers].'],
  ['hr', 'general', 'Where do you see yourself in five years?', 'Show direction that fits this role, without promising anything unrealistic.', 'I would like to deepen my skills in [area] and take on [kind of responsibility].'],
  ['hr', 'general', 'What is your greatest strength?', 'Choose one strength relevant to the role, and back it up with an example.', 'One of my strengths is [strength]. For example, [short example with a result].'],
  ['scenario', 'general', 'You discover a serious mistake in your work just before a deadline. What do you do?', 'Show that you assess the impact, raise it early, propose options and prevent a repeat.', 'First I would [assess impact]. Then I would tell [who], with [options]. Afterward I would [prevent a repeat].'],
  ['scenario', 'general', 'Your manager asks for something you think is the wrong approach. How do you respond?', 'Show that you raise concerns with evidence and respect the final decision.', 'I would ask about [goal], share [evidence and an alternative], and commit to the decision once it is made.'],
  ['scenario', 'general', 'You join a team and find its process is slowing everyone down. What do you do first?', 'Understand before changing. Ask why it exists, measure the cost, and propose a small trial.', 'I would first [learn why], measure [cost], and suggest [small change] as a trial.'],
  ['technical', 'software-engineering', 'How would you design a URL shortening service?', 'Cover requirements, data model, ID generation, read scaling, caching and failure handling.', 'Outline the requirements first, then the API and storage, then how you would handle growth and failures.'],
  ['technical', 'software-engineering', 'Explain the difference between SQL and NoSQL databases, and when to choose each.', 'Compare consistency, schema, query patterns and scaling. Tie the choice to a real case.', 'Relational stores suit [cases] because [reasons]. Document or key-value stores suit [cases]. On [project] I chose [option] because [reason].'],
  ['technical', 'software-engineering', 'How do you find the cause of a slow API endpoint?', 'Measure first: logs, traces, query plans. Then fix the largest cost and verify the result.', 'I would measure [latency breakdown], look at [query plans and traces], fix [the largest cost], and confirm with [metric].'],
  ['technical', 'software-engineering', 'What makes code easy to test? Give an example from your work.', 'Discuss clear boundaries, dependency injection and pure functions, using a real example.', 'Code is easier to test when [property]. On [project], I [change], which allowed [testing benefit].'],
  ['technical', 'software-engineering', 'How do you keep an application secure when handling user uploads?', 'Mention type and size validation, private storage, access checks and malware scanning.', 'I validate [type and size], store files [privately], check [ownership] on each request, and [scan where needed].'],
  ['technical', 'data', 'How would you check whether an A/B test result can be trusted?', 'Cover sample size, duration, randomisation checks, and practical versus statistical significance.', 'I would check [sample and power], [randomisation], and [duration], then weigh [effect size] against the cost.'],
  ['technical', 'data', 'Explain the difference between a left join and an inner join, with an example.', 'Use a simple example and mention what happens to unmatched rows.', 'An inner join keeps only matching rows, whereas a left join keeps all rows from the left table. For example, [example].'],
  ['technical', 'data', 'How do you deal with missing data in an analysis?', 'Explain why data may be missing, and when you would drop, impute or flag it.', 'First I look at [why it is missing]. Then I would [drop, impute or flag] because [reason].'],
  ['technical', 'product-management', 'How do you decide what to build next?', 'Describe how you weigh user evidence, business goals, effort and risk.', 'I start from [goal and evidence], compare options by [method], and share the reasoning with [people].'],
  ['technical', 'product-management', 'How would you measure the success of a new feature?', 'Define a primary metric, guardrails, and what result would change your decision.', 'I would define [primary metric] and [guardrails], then decide [what result leads to which action].'],
  ['technical', 'design', 'Walk me through your design process on a recent project.', 'Show the problem, your research, the options you rejected, and the outcome.', 'The problem was [problem]. I learned [insight], explored [options], chose [option] because [reason], and the result was [outcome].'],
  ['technical', 'design', 'How do you handle disagreement over a design decision?', 'Show how you use research and clear criteria, not opinion or rank.', 'I would agree on [criteria], gather [evidence], and test [the riskiest assumption].'],
  ['technical', 'marketing', 'How would you plan a campaign with a limited budget?', 'Cover audience, goal, channel choice, measurement and how you would adjust.', 'I would define [audience and goal], choose [channels] because [reason], and track [metric] to adjust.'],
  ['technical', 'sales', 'How do you qualify a new lead?', 'Explain your criteria and the questions you ask, and when you walk away.', 'I look for [criteria], ask [questions], and move on when [condition].'],
];

export const FEATURE_FLAGS = { ai: true, registration: true, resume_builder: true, job_search: true, linkedin: true, interview_prep: true, cover_letters: true };
