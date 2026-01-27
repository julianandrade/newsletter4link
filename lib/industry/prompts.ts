/**
 * Industry-Specific AI Prompts
 *
 * Customized scoring and curation prompts for different industry verticals.
 */

export type Industry =
  | "TECHNOLOGY"
  | "FINANCE"
  | "INSURANCE"
  | "HEALTHCARE"
  | "RETAIL"
  | "UTILITIES"
  | "MANUFACTURING"
  | "PROFESSIONAL_SERVICES"
  | "OTHER";

export interface IndustryPromptConfig {
  name: string;
  description: string;
  scoringPrompt: string;
  brandVoiceSuggestion: string;
  keyTopics: string[];
  avoidTopics: string[];
}

/**
 * Industry-specific configurations for AI scoring and content curation
 */
export const industryPrompts: Record<Industry, IndustryPromptConfig> = {
  TECHNOLOGY: {
    name: "Technology",
    description: "Software, hardware, AI, cloud computing, and digital innovation",
    scoringPrompt: `You are evaluating articles for a technology-focused newsletter audience.

PRIORITIZE articles about:
- Artificial Intelligence and Machine Learning developments
- Cloud computing and infrastructure
- Software development practices and tools
- Cybersecurity threats and solutions
- Developer tools and productivity
- Tech industry trends and analysis
- Open source projects and communities
- Programming languages and frameworks

SCORE HIGHER for:
- Technical depth with practical applications
- New product launches or significant updates
- Research breakthroughs with real-world implications
- Industry analysis with data-backed insights
- Tutorials and best practices from experts

SCORE LOWER for:
- Marketing fluff without substance
- Rumors or speculation without sources
- Overly basic content for beginners
- Clickbait headlines without delivery`,
    brandVoiceSuggestion: "Technical but accessible. We explain complex concepts clearly without dumbing them down. Data-driven insights over hype. Focus on practical applications and real-world impact.",
    keyTopics: ["AI/ML", "Cloud", "DevOps", "Security", "Open Source", "APIs", "Infrastructure"],
    avoidTopics: ["Celebrity tech gossip", "Stock price speculation", "Unverified rumors"],
  },

  FINANCE: {
    name: "Finance & Banking",
    description: "Banking, fintech, investments, and financial services",
    scoringPrompt: `You are evaluating articles for a finance and banking newsletter audience.

PRIORITIZE articles about:
- Banking technology and digital transformation
- Regulatory changes (Basel, DORA, PSD2, etc.)
- Fintech innovations and partnerships
- Risk management and compliance
- Payment systems and infrastructure
- Open banking and APIs
- Central bank digital currencies (CBDCs)
- Sustainable finance and ESG
- Fraud prevention and AML

SCORE HIGHER for:
- Regulatory updates with compliance implications
- Case studies of successful digital transformations
- Analysis of market trends with data
- New fintech partnerships or product launches
- Expert commentary on industry direction

SCORE LOWER for:
- Stock tips or investment advice
- Cryptocurrency price speculation
- Sensationalist market crash predictions
- Content without regulatory or operational relevance`,
    brandVoiceSuggestion: "Professional and authoritative. We prioritize accuracy and regulatory compliance. Clear explanations of complex financial concepts. Focus on operational and strategic implications for banking professionals.",
    keyTopics: ["Digital Banking", "RegTech", "Compliance", "Payments", "Open Banking", "Risk Management", "DORA"],
    avoidTopics: ["Investment advice", "Crypto speculation", "Market predictions"],
  },

  INSURANCE: {
    name: "Insurance",
    description: "Insurance technology, underwriting, claims, and risk management",
    scoringPrompt: `You are evaluating articles for an insurance industry newsletter audience.

PRIORITIZE articles about:
- InsurTech innovations and startups
- Claims automation and processing
- Underwriting technology and AI
- Regulatory compliance (Solvency II, IFRS 17)
- Customer experience improvements
- Parametric and embedded insurance
- Climate risk and natural catastrophe modeling
- Health and life insurance trends
- Reinsurance market developments

SCORE HIGHER for:
- Technology implementations with measurable results
- Regulatory guidance and compliance updates
- New product innovations or distribution models
- Data analytics and actuarial advances
- Partnership announcements with strategic value

SCORE LOWER for:
- Generic insurance marketing content
- Individual policy comparisons
- Consumer-focused insurance tips
- Content without industry relevance`,
    brandVoiceSuggestion: "Industry-expert tone balancing technical accuracy with business implications. Focus on operational improvements and regulatory compliance. Practical insights for insurance professionals.",
    keyTopics: ["InsurTech", "Claims", "Underwriting", "Risk Modeling", "Regulation", "Digital Distribution"],
    avoidTopics: ["Consumer insurance tips", "Policy comparisons", "Generic financial advice"],
  },

  HEALTHCARE: {
    name: "Healthcare",
    description: "Healthcare technology, medical innovation, and health systems",
    scoringPrompt: `You are evaluating articles for a healthcare industry newsletter audience.

PRIORITIZE articles about:
- Health IT and electronic health records
- Telemedicine and remote care
- AI in diagnostics and treatment
- Medical device innovations
- Healthcare data privacy and security
- Clinical trial technologies
- Population health management
- Healthcare interoperability standards
- Regulatory updates (HIPAA, FDA, EMA)

SCORE HIGHER for:
- Clinical evidence and research findings
- Technology implementations with patient outcomes
- Regulatory approvals and guidance
- Interoperability and data exchange advances
- Healthcare system efficiency improvements

SCORE LOWER for:
- Alternative medicine without evidence
- Individual health advice or tips
- Sensationalist health claims
- Marketing content for consumer products`,
    brandVoiceSuggestion: "Evidence-based and patient-focused. We prioritize clinical accuracy and regulatory compliance. Clear communication of complex medical and technical concepts for healthcare professionals.",
    keyTopics: ["Health IT", "Telemedicine", "AI Diagnostics", "EHR", "Interoperability", "Digital Health"],
    avoidTopics: ["Unproven treatments", "Personal health advice", "Sensationalist claims"],
  },

  RETAIL: {
    name: "Retail & E-commerce",
    description: "Retail technology, e-commerce, and consumer experience",
    scoringPrompt: `You are evaluating articles for a retail and e-commerce newsletter audience.

PRIORITIZE articles about:
- E-commerce platform innovations
- Omnichannel retail strategies
- Supply chain and logistics technology
- Customer experience and personalization
- Retail analytics and AI
- Payment and checkout innovations
- Inventory management systems
- Social commerce and marketplaces
- Sustainability in retail

SCORE HIGHER for:
- Case studies with measurable business results
- Technology implementations improving operations
- Consumer behavior insights with data
- New platform features or integrations
- Supply chain optimization strategies

SCORE LOWER for:
- Individual product reviews
- Generic shopping tips
- Brand marketing content
- Content without operational relevance`,
    brandVoiceSuggestion: "Business-focused with consumer insight. We connect technology trends to bottom-line impact. Practical strategies for retail leaders navigating digital transformation.",
    keyTopics: ["E-commerce", "Omnichannel", "Supply Chain", "Personalization", "Payments", "Analytics"],
    avoidTopics: ["Product reviews", "Shopping deals", "Brand promotions"],
  },

  UTILITIES: {
    name: "Utilities & Energy",
    description: "Energy, utilities, smart grid, and sustainability",
    scoringPrompt: `You are evaluating articles for a utilities and energy industry newsletter audience.

PRIORITIZE articles about:
- Smart grid and grid modernization
- Renewable energy integration
- Energy storage technologies
- Utility customer experience
- Demand response and load management
- Electric vehicle infrastructure
- Energy efficiency programs
- Regulatory and rate case developments
- Distributed energy resources

SCORE HIGHER for:
- Technology deployments with operational results
- Regulatory decisions with business implications
- Grid reliability and resilience improvements
- Decarbonization strategies and progress
- Innovation in utility business models

SCORE LOWER for:
- Consumer energy-saving tips
- Generic climate change articles
- Political commentary without utility focus
- Content without operational relevance`,
    brandVoiceSuggestion: "Technical and forward-looking. We focus on grid modernization and clean energy transition. Balanced coverage of regulatory, operational, and technological developments for utility professionals.",
    keyTopics: ["Smart Grid", "Renewables", "Storage", "EVs", "DERs", "Grid Resilience", "Decarbonization"],
    avoidTopics: ["Consumer tips", "Political debates", "Generic climate content"],
  },

  MANUFACTURING: {
    name: "Manufacturing",
    description: "Industrial technology, automation, and supply chain",
    scoringPrompt: `You are evaluating articles for a manufacturing industry newsletter audience.

PRIORITIZE articles about:
- Industry 4.0 and smart manufacturing
- Industrial IoT and sensors
- Robotics and automation
- Digital twins and simulation
- Predictive maintenance
- Supply chain visibility
- Quality management systems
- Additive manufacturing (3D printing)
- Workforce development and safety

SCORE HIGHER for:
- Implementation case studies with ROI
- Technology comparisons and evaluations
- Production efficiency improvements
- Supply chain resilience strategies
- Safety and compliance innovations

SCORE LOWER for:
- Generic business news
- Consumer product announcements
- Content without manufacturing focus
- Theoretical without practical application`,
    brandVoiceSuggestion: "Practical and results-oriented. We focus on operational excellence and continuous improvement. Technical depth for manufacturing engineers and operations leaders.",
    keyTopics: ["Industry 4.0", "IoT", "Automation", "Digital Twin", "Predictive Maintenance", "3D Printing"],
    avoidTopics: ["Consumer products", "Generic business news", "Purely theoretical content"],
  },

  PROFESSIONAL_SERVICES: {
    name: "Professional Services",
    description: "Consulting, legal, accounting, and business services",
    scoringPrompt: `You are evaluating articles for a professional services newsletter audience.

PRIORITIZE articles about:
- Digital transformation in services
- AI and automation for knowledge work
- Client experience and delivery
- Practice management technology
- Knowledge management systems
- Talent and workforce trends
- Business development and marketing
- Regulatory and compliance updates
- Project management innovations

SCORE HIGHER for:
- Technology adoption improving service delivery
- Client engagement and retention strategies
- Efficiency gains in professional workflows
- Industry-specific regulatory updates
- Thought leadership with practical insights

SCORE LOWER for:
- Generic productivity tips
- Consumer-focused content
- Self-promotional content
- Content without professional services relevance`,
    brandVoiceSuggestion: "Thoughtful and strategic. We combine industry expertise with practical technology insights. Focus on client value and operational excellence for professional services leaders.",
    keyTopics: ["Digital Transformation", "AI for Knowledge Work", "Client Experience", "Practice Management"],
    avoidTopics: ["Generic productivity", "Self-promotion", "Consumer content"],
  },

  OTHER: {
    name: "General Business",
    description: "General business and technology news",
    scoringPrompt: `You are evaluating articles for a general business newsletter audience.

PRIORITIZE articles about:
- Digital transformation trends
- Business technology adoption
- Industry analysis and trends
- Leadership and management
- Innovation and startups
- Market developments

SCORE HIGHER for:
- Actionable business insights
- Technology with clear business value
- Data-backed analysis
- Expert perspectives

SCORE LOWER for:
- Clickbait without substance
- Overly promotional content
- Rumors and speculation`,
    brandVoiceSuggestion: "Professional and informative. We deliver business insights that matter. Focus on actionable intelligence for decision-makers.",
    keyTopics: ["Digital Transformation", "Business Technology", "Innovation", "Leadership"],
    avoidTopics: ["Clickbait", "Rumors", "Pure speculation"],
  },
};

/**
 * Get the scoring prompt for an industry
 */
export function getIndustryScoringPrompt(industry: Industry): string {
  return industryPrompts[industry]?.scoringPrompt || industryPrompts.OTHER.scoringPrompt;
}

/**
 * Get the brand voice suggestion for an industry
 */
export function getIndustryBrandVoice(industry: Industry): string {
  return industryPrompts[industry]?.brandVoiceSuggestion || industryPrompts.OTHER.brandVoiceSuggestion;
}

/**
 * Get key topics for an industry
 */
export function getIndustryKeyTopics(industry: Industry): string[] {
  return industryPrompts[industry]?.keyTopics || industryPrompts.OTHER.keyTopics;
}

/**
 * Get industry configuration
 */
export function getIndustryConfig(industry: Industry): IndustryPromptConfig {
  return industryPrompts[industry] || industryPrompts.OTHER;
}

/**
 * List all available industries
 */
export function listIndustries(): Array<{ value: Industry; label: string; description: string }> {
  return Object.entries(industryPrompts).map(([value, config]) => ({
    value: value as Industry,
    label: config.name,
    description: config.description,
  }));
}
