import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, Ph } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Consciously.",
  alternates: { canonical: "https://consciously.live/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      other={{ href: "/privacy", label: "Privacy Policy" }}
      intro={
        <p>
          These terms are an agreement between you and Alex Maragakis, trading as Consciously
          (“we”, “us”) for using Consciously on consciously.live, app.consciously.live and our iOS
          and Android apps. By creating an account or using Consciously, you agree to them. Our{" "}
          <Link href="/privacy">Privacy Policy</Link> explains how we handle your data.
        </p>
      }
    >
      <LegalSection title="The service">
        <p>
          Consciously helps you meditate, journal and reflect. It creates guided meditations, audio,
          images and written reflections with AI, from what you tell it. We keep improving it, so
          features may change, and some are only on paid plans. We may pause the service for
          maintenance and will try to keep that short.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <ul>
          <li>You must be at least 18 to use Consciously.</li>
          <li>
            Give us an email address you can receive mail at, and keep access to it and to any
            Apple or Google account you sign in with. You’re responsible for what happens in your
            account.
          </li>
          <li>
            Tell us at{" "}
            <a href="mailto:privacy@consciously.live">privacy@consciously.live</a> if you think
            someone else has accessed it.
          </li>
          <li>You can delete your account at any time in Settings › Account.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>Please don’t use Consciously to:</p>
        <ul>
          <li>break the law, or infringe anyone’s rights, including copyright and privacy;</li>
          <li>
            share content publicly that is hateful, harassing, sexually explicit, violent,
            misleading, or that encourages self-harm;
          </li>
          <li>upload photos of other people without their permission;</li>
          <li>
            try to get around limits, access other accounts, probe or disrupt our systems, or
            scrape the service;
          </li>
          <li>
            resell access, or use the service or its output to build a competing product or train
            AI models;
          </li>
          <li>misrepresent AI-generated content as professional advice.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          You own what you put into Consciously (journal entries, briefs, photos, recordings and so
          on) and what it creates for you. You give us a non-exclusive, worldwide, royalty-free
          licence to host, store, copy, process and transmit that content, including sending it to
          the providers listed in our Privacy Policy, only so far as needed to run, secure and
          improve the service for you. When you share a meditation publicly, the licence also
          covers showing it to others while it is shared. The licence ends when you delete the
          content or your account, apart from copies kept for a short time in backups.
        </p>
        <p>
          Make sure you have the right to everything you upload. We may remove public content that
          breaks these terms.
        </p>
      </LegalSection>

      <LegalSection title="AI-generated content">
        <p>
          Meditations, reflections, insights and guide replies are written by AI. They can be
          wrong, generic, or not right for you, and other people may receive similar output.
        </p>
        <p>
          <strong>
            Consciously is not medical, psychological or therapeutic treatment, and it is not a
            substitute for a qualified professional.
          </strong>{" "}
          It doesn’t diagnose or treat any condition. Speak to a doctor or therapist about your
          health, especially before changing any treatment.
        </p>
        <p>
          <strong>Consciously is not for emergencies.</strong> If you’re in danger or thinking about
          harming yourself, call <strong>999</strong> (or 112) in the UK, or your local emergency
          number, or go to A&amp;E. In the UK you can also call Samaritans free on{" "}
          <strong>116 123</strong>, any time. Outside the UK, contact your local emergency services
          or a crisis line.
        </p>
        <p>
          Don’t listen to meditations while driving or doing anything that needs your full
          attention.
        </p>
      </LegalSection>

      <LegalSection title="Subscriptions and refunds">
        <ul>
          <li>
            Paid plans renew automatically each billing period until you cancel. The price and
            period are shown before you buy. If we change prices, we’ll tell you in advance and
            the new price applies from your next renewal; you can cancel before then.
          </li>
          <li>
            <strong>On the web</strong> (via Stripe): cancel any time in Settings; you keep access
            until the end of the period you’ve paid for. Refunds: <Ph k="refundTerms" />.
          </li>
          <li>
            <strong>In the iOS app</strong>: purchases are made through Apple and governed by the
            App Store terms. Manage or cancel in your Apple ID subscription settings. Refunds are
            handled by Apple at reportaproblem.apple.com; we can’t issue them.
          </li>
          <li>
            <strong>In the Android app</strong>: purchases are made through Google Play and governed
            by its terms. Manage or cancel in Google Play › Subscriptions. Refunds follow Google
            Play’s policies.
          </li>
          <li>
            If you’re a UK consumer you normally have 14 days to cancel a purchase. Because the
            service starts straight away, you agree that it starts within that period and that you
            lose the right to cancel for a refund once you’ve started using paid features, except
            as required by law or by the store you bought from.
          </li>
          <li>Nothing here affects your statutory rights.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Sharing on Listen">
        <p>
          You can share a meditation on a public page at consciously.live/listen. Shared
          meditations can be heard by anyone with the link and, if you list them, found on our
          Listen pages. The page shows the title, description, the name you choose to display and,
          if you choose, your brief. Don’t include anything you wouldn’t want public. You can
          unshare at any time; the page then goes offline, but we can’t recall copies others have
          already made. Listeners may play and share the link, but not download, re-upload or use
          it commercially. We may remove shared meditations that break these terms.
        </p>
      </LegalSection>

      <LegalSection title="Suspension and termination">
        <p>
          You can stop using Consciously and delete your account at any time. We may suspend or
          close your account if you seriously or repeatedly break these terms, if the law requires
          it, or to protect others; where reasonable we’ll tell you first and give you a chance to
          fix it. If we close the service or your account without your fault, we’ll give you
          reasonable notice and refund any unused paid period you bought from us.
        </p>
      </LegalSection>

      <LegalSection title="Our liability">
        <p>
          Nothing in these terms limits liability for death or personal injury caused by our
          negligence, for fraud, or anything else that can’t be limited by law, including your
          rights as a consumer.
        </p>
        <p>
          We provide the service with reasonable care and skill. We are not liable for losses that
          weren’t reasonably foreseeable, for business losses (the service is for personal use), or
          for decisions you make based on AI-generated content. Otherwise our total liability to
          you is limited to the greater of what you paid us in the 12 months before the claim and
          £100.
        </p>
        <p>
          Keep your own copies of anything important; you can export your journal from the Journal.
        </p>
      </LegalSection>

      <LegalSection title="Law and disputes">
        <p>
          These terms are governed by the law of England and Wales, and the courts of England and
          Wales have jurisdiction. If you live in Scotland or Northern Ireland, you can also bring
          proceedings there. Please contact us first; most things can be sorted out quickly.
        </p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>
          We may update these terms as the service changes or the law requires. For material
          changes, we’ll tell you by email or in the app at least 30 days before they take effect.
          If you don’t agree, you can delete your account before then.
        </p>
        <p>
          Questions:{" "}
          <a href="mailto:privacy@consciously.live">privacy@consciously.live</a>, or Alex
          Maragakis, trading as Consciously, Weave Coworking, Cotton Works, Wigan WN3 5EX.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
