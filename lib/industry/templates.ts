/**
 * Industry Templates
 *
 * Pre-configured RSS sources and search topics for each industry vertical.
 */

import { Industry } from "./prompts";

export interface RssSourceTemplate {
  name: string;
  url: string;
  category: string;
  description: string;
}

export interface SearchTopicTemplate {
  name: string;
  query: string;
  description: string;
  schedule: "DAILY" | "WEEKLY" | "MANUAL";
}

export interface IndustryTemplates {
  rssSources: RssSourceTemplate[];
  searchTopics: SearchTopicTemplate[];
}

/**
 * Industry-specific RSS sources and search topics
 */
export const industryTemplates: Record<Industry, IndustryTemplates> = {
  TECHNOLOGY: {
    rssSources: [
      {
        name: "TechCrunch",
        url: "https://techcrunch.com/feed/",
        category: "Tech News",
        description: "Technology news and startup coverage",
      },
      {
        name: "Ars Technica",
        url: "https://feeds.arstechnica.com/arstechnica/index",
        category: "Tech News",
        description: "In-depth technology analysis",
      },
      {
        name: "The Verge",
        url: "https://www.theverge.com/rss/index.xml",
        category: "Tech News",
        description: "Technology, science, and culture",
      },
      {
        name: "Hacker News",
        url: "https://hnrss.org/frontpage",
        category: "Developer",
        description: "Tech community discussions",
      },
      {
        name: "MIT Technology Review",
        url: "https://www.technologyreview.com/feed/",
        category: "Research",
        description: "Emerging technology analysis",
      },
      {
        name: "Wired",
        url: "https://www.wired.com/feed/rss",
        category: "Tech Culture",
        description: "Technology and culture coverage",
      },
      {
        name: "VentureBeat AI",
        url: "https://venturebeat.com/category/ai/feed/",
        category: "AI",
        description: "AI and machine learning news",
      },
      {
        name: "InfoQ",
        url: "https://feed.infoq.com/",
        category: "Developer",
        description: "Software development practices",
      },
    ],
    searchTopics: [
      {
        name: "AI & Machine Learning",
        query: "artificial intelligence machine learning developments 2026",
        description: "Latest AI/ML breakthroughs and applications",
        schedule: "DAILY",
      },
      {
        name: "Cloud & Infrastructure",
        query: "cloud computing AWS Azure GCP infrastructure",
        description: "Cloud platform updates and trends",
        schedule: "WEEKLY",
      },
      {
        name: "Cybersecurity",
        query: "cybersecurity threats vulnerabilities enterprise security",
        description: "Security news and threat intelligence",
        schedule: "DAILY",
      },
      {
        name: "Developer Tools",
        query: "developer tools programming frameworks productivity",
        description: "New tools and development practices",
        schedule: "WEEKLY",
      },
    ],
  },

  FINANCE: {
    rssSources: [
      {
        name: "Finextra",
        url: "https://www.finextra.com/rss/headlines.aspx",
        category: "Fintech",
        description: "Global fintech news",
      },
      {
        name: "American Banker",
        url: "https://www.americanbanker.com/feed",
        category: "Banking",
        description: "US banking industry news",
      },
      {
        name: "Banking Technology",
        url: "https://www.bankingtech.com/feed/",
        category: "Banking Tech",
        description: "Banking technology trends",
      },
      {
        name: "PaymentsSource",
        url: "https://www.paymentssource.com/feed",
        category: "Payments",
        description: "Payments industry coverage",
      },
      {
        name: "The Banker",
        url: "https://www.thebanker.com/rss",
        category: "Banking",
        description: "International banking news",
      },
      {
        name: "Finovate",
        url: "https://finovate.com/feed/",
        category: "Fintech",
        description: "Fintech innovation coverage",
      },
    ],
    searchTopics: [
      {
        name: "DORA Regulation",
        query: "DORA regulation digital operational resilience financial services",
        description: "EU digital resilience regulation updates",
        schedule: "WEEKLY",
      },
      {
        name: "Open Banking",
        query: "open banking PSD2 API banking fintech partnerships",
        description: "Open banking developments",
        schedule: "WEEKLY",
      },
      {
        name: "Digital Banking",
        query: "digital banking transformation neobank challenger bank",
        description: "Digital banking trends",
        schedule: "DAILY",
      },
      {
        name: "Payments Innovation",
        query: "payments innovation instant payments real-time cross-border",
        description: "Payment system innovations",
        schedule: "WEEKLY",
      },
      {
        name: "RegTech & Compliance",
        query: "regtech compliance AML KYC financial regulation technology",
        description: "Regulatory technology updates",
        schedule: "WEEKLY",
      },
    ],
  },

  INSURANCE: {
    rssSources: [
      {
        name: "Insurance Journal",
        url: "https://www.insurancejournal.com/feed/",
        category: "Insurance News",
        description: "Property & casualty insurance news",
      },
      {
        name: "Coverager",
        url: "https://coverager.com/feed/",
        category: "InsurTech",
        description: "Insurance technology coverage",
      },
      {
        name: "Insurance Business",
        url: "https://www.insurancebusinessmag.com/us/rss/news/",
        category: "Insurance News",
        description: "Insurance industry news",
      },
      {
        name: "Reinsurance News",
        url: "https://www.reinsurancene.ws/feed/",
        category: "Reinsurance",
        description: "Reinsurance market coverage",
      },
      {
        name: "Digital Insurance",
        url: "https://www.dig-in.com/feed",
        category: "InsurTech",
        description: "Insurance technology trends",
      },
    ],
    searchTopics: [
      {
        name: "InsurTech Innovation",
        query: "insurtech insurance technology claims automation underwriting AI",
        description: "Insurance technology innovations",
        schedule: "WEEKLY",
      },
      {
        name: "Climate Risk",
        query: "climate risk insurance natural catastrophe modeling",
        description: "Climate and catastrophe risk coverage",
        schedule: "WEEKLY",
      },
      {
        name: "Claims Technology",
        query: "claims automation processing AI insurance technology",
        description: "Claims processing innovations",
        schedule: "WEEKLY",
      },
      {
        name: "Insurance Regulation",
        query: "insurance regulation Solvency II IFRS 17 compliance",
        description: "Regulatory developments",
        schedule: "WEEKLY",
      },
    ],
  },

  HEALTHCARE: {
    rssSources: [
      {
        name: "Healthcare IT News",
        url: "https://www.healthcareitnews.com/feed",
        category: "Health IT",
        description: "Healthcare technology news",
      },
      {
        name: "STAT News",
        url: "https://www.statnews.com/feed/",
        category: "Healthcare",
        description: "Health and medicine reporting",
      },
      {
        name: "Modern Healthcare",
        url: "https://www.modernhealthcare.com/feed",
        category: "Healthcare",
        description: "Healthcare business news",
      },
      {
        name: "MobiHealthNews",
        url: "https://www.mobihealthnews.com/feed",
        category: "Digital Health",
        description: "Digital health coverage",
      },
      {
        name: "Health Data Management",
        url: "https://www.healthdatamanagement.com/feed",
        category: "Health IT",
        description: "Health data and analytics",
      },
    ],
    searchTopics: [
      {
        name: "AI in Healthcare",
        query: "artificial intelligence healthcare diagnostics clinical AI FDA",
        description: "AI applications in healthcare",
        schedule: "DAILY",
      },
      {
        name: "Telehealth",
        query: "telehealth telemedicine remote patient monitoring virtual care",
        description: "Telehealth developments",
        schedule: "WEEKLY",
      },
      {
        name: "EHR & Interoperability",
        query: "electronic health records EHR interoperability FHIR HL7",
        description: "Health data exchange standards",
        schedule: "WEEKLY",
      },
      {
        name: "Healthcare Regulation",
        query: "healthcare regulation HIPAA FDA digital health compliance",
        description: "Healthcare regulatory updates",
        schedule: "WEEKLY",
      },
    ],
  },

  RETAIL: {
    rssSources: [
      {
        name: "Retail Dive",
        url: "https://www.retaildive.com/feeds/news/",
        category: "Retail News",
        description: "Retail industry news",
      },
      {
        name: "Chain Store Age",
        url: "https://chainstoreage.com/feed",
        category: "Retail",
        description: "Retail operations coverage",
      },
      {
        name: "Retail TouchPoints",
        url: "https://www.retailtouchpoints.com/feed",
        category: "Retail Tech",
        description: "Retail technology trends",
      },
      {
        name: "Digital Commerce 360",
        url: "https://www.digitalcommerce360.com/feed/",
        category: "E-commerce",
        description: "E-commerce industry coverage",
      },
      {
        name: "Glossy",
        url: "https://www.glossy.co/feed/",
        category: "Fashion Retail",
        description: "Fashion and beauty retail",
      },
    ],
    searchTopics: [
      {
        name: "E-commerce Innovation",
        query: "e-commerce innovation online retail technology personalization",
        description: "E-commerce technology trends",
        schedule: "WEEKLY",
      },
      {
        name: "Omnichannel Retail",
        query: "omnichannel retail unified commerce BOPIS curbside",
        description: "Omnichannel strategies",
        schedule: "WEEKLY",
      },
      {
        name: "Retail Supply Chain",
        query: "retail supply chain logistics fulfillment inventory management",
        description: "Retail supply chain trends",
        schedule: "WEEKLY",
      },
      {
        name: "Customer Experience",
        query: "retail customer experience personalization loyalty CX",
        description: "Customer experience innovations",
        schedule: "WEEKLY",
      },
    ],
  },

  UTILITIES: {
    rssSources: [
      {
        name: "Utility Dive",
        url: "https://www.utilitydive.com/feeds/news/",
        category: "Utilities",
        description: "Utility industry news",
      },
      {
        name: "Greentech Media",
        url: "https://www.greentechmedia.com/feed",
        category: "Clean Energy",
        description: "Clean energy coverage",
      },
      {
        name: "Smart Energy International",
        url: "https://www.smart-energy.com/feed/",
        category: "Smart Grid",
        description: "Smart grid technology",
      },
      {
        name: "Energy Storage News",
        url: "https://www.energy-storage.news/feed/",
        category: "Storage",
        description: "Energy storage coverage",
      },
      {
        name: "PV Magazine",
        url: "https://www.pv-magazine.com/feed/",
        category: "Solar",
        description: "Solar energy news",
      },
    ],
    searchTopics: [
      {
        name: "Grid Modernization",
        query: "smart grid modernization utility digital transformation AMI",
        description: "Grid modernization efforts",
        schedule: "WEEKLY",
      },
      {
        name: "Renewable Integration",
        query: "renewable energy integration solar wind grid stability",
        description: "Renewable energy grid integration",
        schedule: "WEEKLY",
      },
      {
        name: "Energy Storage",
        query: "energy storage battery utility-scale grid storage",
        description: "Energy storage developments",
        schedule: "WEEKLY",
      },
      {
        name: "EV Infrastructure",
        query: "electric vehicle charging infrastructure utility EV",
        description: "EV charging and utilities",
        schedule: "WEEKLY",
      },
    ],
  },

  MANUFACTURING: {
    rssSources: [
      {
        name: "Manufacturing Dive",
        url: "https://www.manufacturingdive.com/feeds/news/",
        category: "Manufacturing",
        description: "Manufacturing industry news",
      },
      {
        name: "Industry Week",
        url: "https://www.industryweek.com/feed",
        category: "Manufacturing",
        description: "Manufacturing leadership",
      },
      {
        name: "Automation World",
        url: "https://www.automationworld.com/rss.xml",
        category: "Automation",
        description: "Industrial automation",
      },
      {
        name: "Assembly Magazine",
        url: "https://www.assemblymag.com/rss",
        category: "Manufacturing",
        description: "Assembly and production",
      },
      {
        name: "3D Printing Industry",
        url: "https://3dprintingindustry.com/feed/",
        category: "Additive",
        description: "Additive manufacturing news",
      },
    ],
    searchTopics: [
      {
        name: "Industry 4.0",
        query: "industry 4.0 smart manufacturing digital factory IIoT",
        description: "Smart manufacturing trends",
        schedule: "WEEKLY",
      },
      {
        name: "Industrial Automation",
        query: "industrial automation robotics cobots manufacturing AI",
        description: "Automation and robotics",
        schedule: "WEEKLY",
      },
      {
        name: "Predictive Maintenance",
        query: "predictive maintenance manufacturing IoT sensors analytics",
        description: "Predictive maintenance tech",
        schedule: "WEEKLY",
      },
      {
        name: "Supply Chain Resilience",
        query: "manufacturing supply chain resilience nearshoring reshoring",
        description: "Supply chain strategies",
        schedule: "WEEKLY",
      },
    ],
  },

  PROFESSIONAL_SERVICES: {
    rssSources: [
      {
        name: "Consulting Magazine",
        url: "https://www.consultingmag.com/feed/",
        category: "Consulting",
        description: "Consulting industry coverage",
      },
      {
        name: "Law.com",
        url: "https://www.law.com/feed/",
        category: "Legal",
        description: "Legal industry news",
      },
      {
        name: "Accounting Today",
        url: "https://www.accountingtoday.com/feed",
        category: "Accounting",
        description: "Accounting profession news",
      },
      {
        name: "Legal Tech News",
        url: "https://www.law.com/legaltechnews/feed/",
        category: "Legal Tech",
        description: "Legal technology trends",
      },
    ],
    searchTopics: [
      {
        name: "AI in Professional Services",
        query: "artificial intelligence consulting legal accounting automation",
        description: "AI in professional services",
        schedule: "WEEKLY",
      },
      {
        name: "Legal Tech",
        query: "legal technology legaltech contract automation document AI",
        description: "Legal technology innovations",
        schedule: "WEEKLY",
      },
      {
        name: "Future of Work",
        query: "professional services future of work hybrid remote talent",
        description: "Workforce trends",
        schedule: "WEEKLY",
      },
    ],
  },

  OTHER: {
    rssSources: [
      {
        name: "Harvard Business Review",
        url: "https://hbr.org/feed",
        category: "Business",
        description: "Business management insights",
      },
      {
        name: "Fast Company",
        url: "https://www.fastcompany.com/feed",
        category: "Business",
        description: "Business innovation coverage",
      },
      {
        name: "Forbes Technology",
        url: "https://www.forbes.com/technology/feed/",
        category: "Tech Business",
        description: "Tech business news",
      },
    ],
    searchTopics: [
      {
        name: "Digital Transformation",
        query: "digital transformation business technology innovation",
        description: "Digital transformation trends",
        schedule: "WEEKLY",
      },
      {
        name: "Business Technology",
        query: "business technology enterprise software automation",
        description: "Enterprise technology news",
        schedule: "WEEKLY",
      },
    ],
  },
};

/**
 * Get RSS sources for an industry
 */
export function getIndustryRssSources(industry: Industry): RssSourceTemplate[] {
  return industryTemplates[industry]?.rssSources || industryTemplates.OTHER.rssSources;
}

/**
 * Get search topics for an industry
 */
export function getIndustrySearchTopics(industry: Industry): SearchTopicTemplate[] {
  return industryTemplates[industry]?.searchTopics || industryTemplates.OTHER.searchTopics;
}

/**
 * Get all templates for an industry
 */
export function getIndustryTemplates(industry: Industry): IndustryTemplates {
  return industryTemplates[industry] || industryTemplates.OTHER;
}
