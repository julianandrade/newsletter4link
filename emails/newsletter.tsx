import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import * as React from "react";

interface Article {
  title: string;
  summary: string;
  sourceUrl: string;
  category: string[];
}

interface Project {
  name: string;
  description: string;
  team: string;
  impact?: string;
  projectDate: string;
  imageUrl?: string;
}

interface NewsletterEmailProps {
  articles: Article[];
  projects: Project[];
  week: number;
  year: number;
  subscriberId?: string;
  previewText?: string;
  logoUrl?: string;
  bannerUrl?: string;
}

export const NewsletterEmail = ({
  articles = [],
  projects = [],
  week = 1,
  year = 2026,
  subscriberId = "",
  previewText = "This week's top AI and tech stories",
  logoUrl,
  bannerUrl,
}: NewsletterEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Banner - shown at very top if provided */}
          {bannerUrl && (
            <Section style={bannerSection}>
              <Img
                src={bannerUrl}
                alt="Newsletter Banner"
                width="600"
                style={bannerImage}
              />
            </Section>
          )}

          {/* Header */}
          <Section style={bannerUrl ? headerWithBanner : header}>
            {logoUrl ? (
              <Img
                src={logoUrl}
                alt="AI Radar"
                width="48"
                height="48"
                style={logoImage}
              />
            ) : null}
            <Heading style={h1}>
              {!logoUrl && "📡 "}AI Radar
            </Heading>
            <Text style={tagline}>Link's AI Intelligence Hub</Text>
            <Text style={subtitle}>
              Week {week}, {year}
            </Text>
          </Section>

          {/* Introduction */}
          <Section style={section}>
            <Text style={text}>
              Your AI intelligence, delivered. This week's curated insights on
              artificial intelligence and emerging technology.
            </Text>
          </Section>

          <Hr style={hr} />

          {/* Main Articles Section */}
          <Section style={section}>
            <Heading as="h2" style={h2}>
              📡 On the Radar
            </Heading>

            {articles.map((article, index) => (
              <div key={index} style={articleBlock}>
                <Heading as="h3" style={h3}>
                  {index + 1}. {article.title}
                </Heading>

                {article.category.length > 0 && (
                  <div style={categoryContainer}>
                    {article.category.map((cat, i) => (
                      <span key={i} style={categoryBadge}>
                        {cat}
                      </span>
                    ))}
                  </div>
                )}

                <Text style={articleSummary}>{article.summary}</Text>

                <Link href={article.sourceUrl} style={readMoreLink}>
                  Read more →
                </Link>
              </div>
            ))}
          </Section>

          {/* Internal Projects Section */}
          {projects.length > 0 && (
            <>
              <Hr style={hr} />
              <Section style={projectsSection}>
                <Heading as="h2" style={h2}>
                  🎯 Radar Picks
                </Heading>
                <Text style={text}>
                  Spotlighting Link's latest AI achievements and innovations.
                </Text>

                {projects.map((project, index) => (
                  <div key={index} style={projectBlock}>
                    {project.imageUrl && (
                      <Img
                        src={project.imageUrl}
                        alt={project.name}
                        width="100%"
                        style={projectImage}
                      />
                    )}
                    <Heading as="h3" style={h3}>
                      {project.name}
                    </Heading>
                    <Text style={projectMeta}>
                      {project.team} •{" "}
                      {new Date(project.projectDate).toLocaleDateString(
                        "en-US",
                        {
                          month: "long",
                          year: "numeric",
                        }
                      )}
                    </Text>
                    <Text style={projectDescription}>{project.description}</Text>
                    {project.impact && (
                      <div style={impactBox}>
                        <Text style={impactLabel}>Impact:</Text>
                        <Text style={impactText}>{project.impact}</Text>
                      </div>
                    )}
                  </div>
                ))}
              </Section>
            </>
          )}

          {/* Footer */}
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>
              AI Radar is curated using AI and reviewed by the Link Consulting team.
            </Text>
            <Text style={footerText}>
              <Link
                href={`${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?id=${subscriberId}`}
                style={footerLink}
              >
                Unsubscribe
              </Link>
              {" • "}
              <Link
                href="https://linkconsulting.com"
                style={footerLink}
              >
                Link Consulting
              </Link>
            </Text>
            <Text style={footerCopyright}>
              © {year} Link Consulting. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default NewsletterEmail;

// Styles
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "600px",
};

const bannerSection = {
  padding: "0",
  margin: "0",
};

const bannerImage = {
  width: "100%",
  maxWidth: "600px",
  height: "auto",
  display: "block",
  borderRadius: "8px 8px 0 0",
};

const header = {
  padding: "32px 40px",
  textAlign: "center" as const,
  backgroundColor: "#1e3a5f",
  borderRadius: "8px 8px 0 0",
};

const headerWithBanner = {
  padding: "32px 40px",
  textAlign: "center" as const,
  backgroundColor: "#1e3a5f",
  borderRadius: "0",
};

const logoImage = {
  margin: "0 auto 12px",
  display: "block",
  borderRadius: "8px",
};

const h1 = {
  color: "#ffffff",
  fontSize: "32px",
  fontWeight: "700",
  margin: "0 0 8px",
  padding: "0",
  lineHeight: "1.25",
};

const tagline = {
  color: "#00b4d8",
  fontSize: "14px",
  fontWeight: "500",
  margin: "4px 0 0",
  padding: "0",
  letterSpacing: "0.5px",
  textTransform: "uppercase" as const,
};

const subtitle = {
  color: "#cbd5e1",
  fontSize: "16px",
  margin: "8px 0 0",
  padding: "0",
};

const section = {
  padding: "24px 40px",
};

const projectsSection = {
  padding: "24px 40px",
  backgroundColor: "#f8fafc",
};

const h2 = {
  color: "#1e3a5f",
  fontSize: "24px",
  fontWeight: "600",
  margin: "0 0 16px",
  padding: "0",
};

const h3 = {
  color: "#334155",
  fontSize: "18px",
  fontWeight: "600",
  margin: "0 0 8px",
  padding: "0",
  lineHeight: "1.4",
};

const text = {
  color: "#475569",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 16px",
};

const articleBlock = {
  marginBottom: "32px",
};

const categoryContainer = {
  marginBottom: "12px",
};

const categoryBadge = {
  display: "inline-block",
  backgroundColor: "#e0f7fa",
  color: "#0891b2",
  padding: "4px 12px",
  borderRadius: "12px",
  fontSize: "12px",
  fontWeight: "500",
  marginRight: "8px",
  marginBottom: "8px",
};

const articleSummary = {
  color: "#64748b",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "12px 0",
};

const readMoreLink = {
  color: "#00b4d8",
  fontSize: "14px",
  fontWeight: "500",
  textDecoration: "none",
};

const projectBlock = {
  backgroundColor: "#ffffff",
  padding: "20px",
  borderRadius: "8px",
  marginBottom: "16px",
  border: "1px solid #e2e8f0",
};

const projectImage = {
  width: "100%",
  height: "auto",
  borderRadius: "6px",
  marginBottom: "16px",
  display: "block",
};

const projectMeta = {
  color: "#94a3b8",
  fontSize: "14px",
  margin: "0 0 12px",
};

const projectDescription = {
  color: "#475569",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 12px",
};

const impactBox = {
  backgroundColor: "#f0fdf4",
  padding: "12px 16px",
  borderRadius: "6px",
  borderLeft: "3px solid #22c55e",
  marginTop: "12px",
};

const impactLabel = {
  color: "#166534",
  fontSize: "13px",
  fontWeight: "600",
  margin: "0 0 4px",
};

const impactText = {
  color: "#15803d",
  fontSize: "14px",
  margin: "0",
  lineHeight: "1.5",
};

const hr = {
  borderColor: "#e2e8f0",
  margin: "0",
};

const footer = {
  padding: "24px 40px",
  textAlign: "center" as const,
};

const footerText = {
  color: "#94a3b8",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "8px 0",
};

const footerLink = {
  color: "#64748b",
  textDecoration: "underline",
};

const footerCopyright = {
  color: "#cbd5e1",
  fontSize: "12px",
  margin: "16px 0 0",
};
