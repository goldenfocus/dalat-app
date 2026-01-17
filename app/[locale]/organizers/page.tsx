import { Construction } from "lucide-react";
import { Link } from "@/lib/i18n/routing";

export default function OrganizersPage() {
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <div className="bg-card p-8 rounded-2xl shadow-sm border border-border max-w-md w-full text-center">
                <div className="w-16 h-16 bg-muted text-primary rounded-full flex items-center justify-center mx-auto mb-6">
                    <Construction className="w-8 h-8" />
                </div>
                <h1 className="text-3xl font-extrabold text-foreground mb-2 tracking-tight">Organizers</h1>
                <p className="text-muted-foreground mb-8">
                    We're building a directory of local event organizers. Check back soon!
                </p>
                <Link
                    href="/"
                    className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    Back to Map
                </Link>
            </div>
        </div>
    );
}
