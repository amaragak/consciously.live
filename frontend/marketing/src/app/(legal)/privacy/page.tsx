import type { Metadata } from "next";
import { LegalPage, LegalSection, Ph } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Consciously collects, uses and protects your personal data.",
  alternates: { canonical: "https://consciously.live/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      other={{ href: "/terms", label: "Terms of Service" }}
      intro={
        <p>
          Consciously is a place for meditation, journaling and reflection, so some of what you
          share with us is personal and can be sensitive. This policy explains what we collect, why,
          who helps us run the service, how long we keep things and the choices you have. It
          applies to consciously.live, app.consciously.live and the Consciously apps for iOS and
          Android.
        </p>
      }
    >
      <LegalSection title="Who we are">
        <p>
          Consciously is run by Alex Maragakis, trading as Consciously, Weave Coworking, Cotton
          Works, Wigan WN3 5EX (“we”, “us”). We are the controller of your personal data under the
          UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018. ICO
          registration number: <Ph k="icoNumber" />.
        </p>
        <p>
          For anything about your data, email{" "}
          <a href="mailto:privacy@consciously.live">privacy@consciously.live</a>.
        </p>
      </LegalSection>

      <LegalSection title="What we collect and why">
        <p>
          For each kind of data, the lawful basis we rely on is in bold. “Contract” means we need
          it to provide the service you signed up for.
        </p>
        <h3>Your account</h3>
        <ul>
          <li>
            Email address, display name, username, plan and the date you joined, plus your password
            or passkey if you use one. If you sign in with Apple or Google, we receive your email
            (which may be an Apple private relay address) and, if you allow it, your name.{" "}
            <strong>Contract.</strong>
          </li>
          <li>
            One-time sign-in links and codes, and the IP address that asked for them (to stop
            abuse). These expire after 15 minutes. <strong>Contract; legitimate interests</strong>{" "}
            (security).
          </li>
          <li>
            Your settings, such as pronouns, time zone, language, theme, notification and AI
            preferences. <strong>Contract.</strong>
          </li>
        </ul>
        <h3>What you create</h3>
        <ul>
          <li>
            Journal entries, gratitudes, moods, voice notes and their transcripts, and journals you
            import.
          </li>
          <li>
            Manifest content: life areas, goals, to-dos, values, regrets, quotes, your manifesto and
            vision board, including any photos you upload (a photo of yourself, or of other people
            or pets).
          </li>
          <li>
            Meditation briefs, scripts, and the audio and cover images we generate for you;
            ratings, favourites and listening mixes.
          </li>
          <li>
            Conversations with the in-app guide, and the insights and weekly letters we write from
            your journal.
          </li>
        </ul>
        <p>
          <strong>Contract</strong>, because creating, storing and personalising these is the
          service. Journal entries and similar content can reveal information about your health,
          including mental health, which is special category data. We process it only to provide
          the features you choose to use, on the basis of your <strong>explicit consent</strong>,
          which you give when you create your account by agreeing to this. You can withdraw consent
          at any time by deleting the content or your account.
        </p>
        <p>
          Only upload photos of other people if they are happy for you to. We use photos only to
          create your vision board images, not to identify anyone.
        </p>
        <h3>Sharing on Listen</h3>
        <p>
          If you share a meditation publicly, its title, description, the name you choose to show
          and, if you include it, your brief become visible to anyone with the link, and on our
          Listen pages if you list it. <strong>Consent</strong>; you can unshare at any time.
        </p>
        <h3>Payments</h3>
        <p>
          If you subscribe on the web, Stripe handles your card details; we never see them. We keep
          your Stripe customer and subscription IDs and your plan. <strong>Contract</strong>, and{" "}
          <strong>legal obligation</strong> for tax and accounting records. In-app purchases are
          handled by Apple or Google, who tell us your subscription status.
        </p>
        <h3>The waitlist</h3>
        <p>
          If you joined our waitlist, we hold your email, what you told us you wanted, and how you
          found us (referrer and campaign tags). <strong>Consent.</strong>
        </p>
        <h3>Running the service safely</h3>
        <p>
          Server logs (which include your user ID, request details and errors), rate-limit records,
          and a record of each AI request (feature, model, size and cost) that we keep for about 120
          days. <strong>Legitimate interests</strong>: keeping the service secure, fixing faults and
          managing costs.
        </p>
        <h3>Emails</h3>
        <p>
          Sign-in and account emails: <strong>contract</strong>. Product news, only if you opt in
          under Settings: <strong>consent</strong>, and you can opt out at any time. We record
          bounces and spam complaints so we stop emailing addresses that cannot receive mail.
        </p>
        <p>
          We do not sell your data, use it for advertising, or use analytics or advertising
          trackers. We do not use your content to train AI models.
        </p>
      </LegalSection>

      <LegalSection title="Who helps us provide the service">
        <p>
          We use the providers below to run Consciously. They process data on our instructions
          (as processors), except where noted.
        </p>
        <ul>
          <li>
            <strong>Amazon Web Services</strong> (UK, London region): hosting, databases, file
            storage, sign-in and email. All of your data is stored here.
          </li>
          <li>
            <strong>Anthropic</strong> (Claude, US): writes meditation scripts, guide replies,
            journal insights and letters, and reads imported PDFs and images. It receives the text
            needed for each request, which can include journal excerpts when you ask the guide or
            generate insights. Under its commercial terms Anthropic does not train its models on our
            requests, and deletes them within about 30 days unless they are flagged for misuse.
          </li>
          <li>
            <strong>OpenAI</strong> (US): transcribes journal voice notes and creates meditation
            cover images. OpenAI does not train its models on data sent through its API. It keeps
            image requests for up to 30 days to detect misuse, and does not keep transcription
            requests.
          </li>
          <li>
            <strong>Google</strong> (Gemini, US): creates vision board images from your prompt and
            any photos you add. We use Google’s paid service, under which Google does not use our
            requests to improve its products and keeps them only for a limited period to detect
            misuse.
          </li>
          <li>
            <strong>RunPod</strong> (US): turns meditation scripts and weekly letters into audio;
            weekly letters are drawn from your journal. RunPod processes data only on our
            instructions under its data processing agreement.
          </li>
          <li>
            <strong>Algolia</strong>: powers search across your journal, Manifest and library. Your
            index is held in the <Ph k="algoliaRegion" /> region; search logs may be processed
            outside it. Algolia deletes our data within 90 days of the end of our contract.
          </li>
          <li>
            <strong>Brevo</strong> (France, EU): delivers our sign-in and account emails, and
            product news if you opt in.
          </li>
          <li>
            <strong>Stripe</strong>: payments, as an independent controller under its own privacy
            policy.
          </li>
          <li>
            <strong>Apple</strong> and <strong>Google</strong>: sign-in, app store purchases, and
            dictation on your device, under their own privacy policies.
          </li>
          <li>
            <strong>Google Fonts</strong>: the website loads fonts from Google, which sees your IP
            address.
          </li>
        </ul>
        <p>
          We may also share data if the law requires it, to protect someone’s safety, or with a
          buyer if Consciously is sold (and we will tell you first).
        </p>
      </LegalSection>

      <LegalSection title="International transfers">
        <p>
          Your data is stored in the UK. Some providers above process it in the United States or
          elsewhere. When they do, we rely on the UK International Data Transfer Addendum to the EU
          Standard Contractual Clauses in each provider’s data processing terms (OpenAI, RunPod,
          Google and Anthropic), or the UK–US Data Bridge where a provider is certified. You can ask
          us for details.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <ul>
          <li>Your account and content: for as long as you have an account.</li>
          <li>
            When you delete your account, we delete your account and content from our live systems
            straight away, and from backups and file history within 90 days.
          </li>
          <li>Sign-in links and codes: 15 minutes. Sign-in sessions: up to 30 days.</li>
          <li>AI request records: about 120 days.</li>
          <li>Waitlist entries: until you ask us to remove them or we close the waitlist.</li>
          <li>Payment records: six years, for tax law.</li>
          <li>Bounce and complaint records: kept so we don’t email those addresses again.</li>
          <li>
            Providers keep request data under their own terms (see above). Content you shared
            publicly may have been copied by others before you removed it.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>Under UK data protection law you can ask us to:</p>
        <ul>
          <li>give you a copy of your data (access), and in a portable format (portability);</li>
          <li>correct it (rectification) or delete it (erasure);</li>
          <li>
            restrict or object to how we use it, including where we rely on legitimate interests;
          </li>
          <li>
            withdraw consent, where we rely on consent, without affecting what came before.
          </li>
        </ul>
        <p>
          You can delete your account in Settings › Account, and export your journal from the
          Journal. For anything else, email{" "}
          <a href="mailto:privacy@consciously.live">privacy@consciously.live</a>. We reply within
          one month and may need to confirm it’s you. These requests are free.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <p>
          We use only what’s needed to keep you signed in and make the app work: secure sign-in
          cookies and a small cookie that tells the site you’re signed in. The app also stores data
          on your device (in your browser’s local storage, or the app’s storage and your phone’s
          secure keychain) so it loads quickly and works offline, including copies of your recent
          journal and Manifest content. Signing out clears your session; clearing your browser data
          removes the rest.
        </p>
        <p>
          We don’t use analytics, advertising or tracking cookies, so we don’t ask for cookie
          consent. If that changes, we’ll ask first.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          Consciously is not for anyone under 18. We don’t knowingly collect data from children. If
          you think a child has given us data, email{" "}
          <a href="mailto:privacy@consciously.live">privacy@consciously.live</a> and we’ll delete
          it.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Data is encrypted in transit and at rest, access is restricted, and sign-in uses
          short-lived tokens. No system is perfectly secure; if a breach affects you, we’ll tell
          you and the ICO as the law requires.
        </p>
      </LegalSection>

      <LegalSection title="Contact and complaints">
        <p>
          Email <a href="mailto:privacy@consciously.live">privacy@consciously.live</a> or write to
          Alex Maragakis, trading as Consciously, Weave Coworking, Cotton Works, Wigan WN3 5EX. If
          you’re unhappy with how we handle your data, you can complain to the Information
          Commissioner’s Office (ICO) at{" "}
          <a href="https://ico.org.uk/make-a-complaint/" rel="noopener noreferrer">
            ico.org.uk/make-a-complaint
          </a>{" "}
          or 0303 123 1113. We’d appreciate the chance to put it right first.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          When we make a material change, we’ll update the date at the top, tell you by email or in
          the app at least 30 days before it takes effect, and ask for consent again where the law
          requires it. Small clarifications are shown by the new date only.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
