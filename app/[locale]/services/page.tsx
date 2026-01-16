import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft, Grid } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function ServicesPage() {
    const t = await getTranslations();

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
                <div className="container flex h-14 max-w-7xl items-center justify-between mx-auto px-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-sm font-medium hover:text-green-600 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </Link>
                        <h1 className="font-bold text-lg">Services</h1>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container max-w-4xl mx-auto px-4 py-16">
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
                        <Grid className="w-10 h-10 text-green-600" />
                    </div>

                    <h2 className="text-3xl font-bold mb-4">Local Services</h2>
                    <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
                        Find local services, guides, and recommendations for living in DaLat.
                        This section is currently under development.
                    </p>

                    <div className="flex gap-4 justify-center">
                        <Link href="/">
                            <Button variant="outline">
                                Back to Events
                            </Button>
                        </Link>
                        <Link href="/events/new">
                            <Button className="bg-green-600 hover:bg-green-700">
                                Create Event
                            </Button>
                        </Link>
                    </div>

                    <div className="mt-16 p-8 bg-white rounded-lg border border-gray-200 max-w-2xl mx-auto">
                        <h3 className="font-semibold text-lg mb-4">Coming Soon</h3>
                        <ul className="text-left space-y-2 text-gray-600">
                            <li>• Local service providers</li>
                            <li>• Accommodation recommendations</li>
                            <li>• Transportation options</li>
                            <li>• Food delivery services</li>
                            <li>• Healthcare facilities</li>
                        </ul>
                    </div>
                </div>
            </main>
        </div>
    );
}
