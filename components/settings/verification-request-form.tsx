"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailInput } from "@/components/ui/email-input";
import { UrlInput as _UrlInput } from "@/components/ui/url-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VerificationRequest, OrganizerType } from "@/lib/types";

interface VerificationRequestFormProps {
  userId: string;
  existingRequest?: VerificationRequest;
}

export function VerificationRequestForm({
  userId,
  existingRequest,
}: VerificationRequestFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [organizerName, setOrganizerName] = useState(existingRequest?.organizer_name || "");
  const [organizerType, setOrganizerType] = useState<OrganizerType>(
    existingRequest?.organizer_type || "venue"
  );
  const [organizerDescription, setOrganizerDescription] = useState(
    existingRequest?.organizer_description || ""
  );
  const [contactEmail, setContactEmail] = useState(existingRequest?.contact_email || "");
  const [contactPhone, setContactPhone] = useState(existingRequest?.contact_phone || "");
  const [proofLink, setProofLink] = useState(existingRequest?.proof_links?.[0] || "");
  const [proofMessage, setProofMessage] = useState(existingRequest?.proof_message || "");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const supabase = createClient();

    const requestData = {
      organizer_name: organizerName,
      organizer_type: organizerType,
      organizer_description: organizerDescription || null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      proof_links: proofLink ? [proofLink] : [],
      proof_message: proofMessage || null,
      status: "pending" as const,
    };

    if (existingRequest) {
      await supabase
        .from("verification_requests")
        .update(requestData)
        .eq("id", existingRequest.id);
    } else {
      await supabase.from("verification_requests").insert({
        user_id: userId,
        ...requestData,
      });

      // Update user role to organizer_pending
      await supabase
        .from("profiles")
        .update({ role: "organizer_pending" })
        .eq("id", userId);
    }

    setIsSubmitting(false);
    setSubmitted(true);
    router.refresh();
  };

  if (submitted) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <h3 className="text-xl font-semibold mb-2">Request Submitted!</h3>
          <p className="text-muted-foreground">
            We&apos;ll review your request and get back to you soon.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {existingRequest ? "Update Your Request" : "Request Verification"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="organizerName">Organization Name *</Label>
            <Input
              id="organizerName"
              value={organizerName}
              onChange={(e) => setOrganizerName(e.target.value)}
              placeholder="Your organization or venue name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="organizerType">Organization Type *</Label>
            <select
              id="organizerType"
              value={organizerType}
              onChange={(e) => setOrganizerType(e.target.value as OrganizerType)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              required
            >
              <option value="venue">Venue (Cafe, Bar, Restaurant)</option>
              <option value="cultural_org">Cultural Organization</option>
              <option value="committee">Festival Committee</option>
              <option value="ward">Ward (Phường)</option>
              <option value="city">City Government</option>
              <option value="business">Business</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="organizerDescription">About your organization</Label>
            <textarea
              id="organizerDescription"
              value={organizerDescription}
              onChange={(e) => setOrganizerDescription(e.target.value)}
              placeholder="What kind of events do you organize?"
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <EmailInput
                id="contactEmail"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                onBlur={(e) => setContactEmail(e.target.value)}
                placeholder="contact@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <Input
                id="contactPhone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+84..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proofLink">Proof Link (Website/Facebook) *</Label>
            <Input
              id="proofLink"
              type="url"
              value={proofLink}
              onChange={(e) => setProofLink(e.target.value)}
              placeholder="https://facebook.com/your-page"
              required
            />
            <p className="text-xs text-muted-foreground">
              Link to your official website or social media page
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proofMessage">Additional Information</Label>
            <textarea
              id="proofMessage"
              value={proofMessage}
              onChange={(e) => setProofMessage(e.target.value)}
              placeholder="Any additional context to help us verify your organization..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Submitting...
              </>
            ) : existingRequest ? (
              "Update Request"
            ) : (
              "Submit Request"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
