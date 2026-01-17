import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft, Book } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function GuidePage() {
    const t = await getTranslations();

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <div className="container flex h-14 max-w-7xl items-center justify-between mx-auto px-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-sm font-medium hover:text-green-600 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </Link>
                        <h1 className="font-bold text-lg">Guide to Dalat</h1>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container max-w-4xl mx-auto px-4 py-12">
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-green-500 shadow-xl shadow-green-500/20 mb-8 transform -rotate-3">
                        <Book className="w-12 h-12 text-white" />
                    </div>

                    <h2 className="text-5xl font-extrabold mb-6 tracking-tight text-foreground">Welcome to Da Lat</h2>
                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                        Your comprehensive handbook for living, visiting, and thriving in the City of Eternal Spring.
                    </p>
                </div>

                <div className="space-y-6 max-w-2xl mx-auto">
                    {/* Expat Living Card */}
                    <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden transition-all hover:shadow-md">
                        <div className="p-6">
                            <div className="flex items-start gap-4 mb-4">
                                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" /><path d="M3.6 9h16.8" /><path d="M3.6 15h16.8" /><path d="M11.5 3a17 17 0 0 0 0 18" /><path d="M12.5 3a17 17 0 0 0 0 18" /></svg>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-foreground">Expat Living in Da Lat</h3>
                                    <p className="text-sm text-muted-foreground">Essential information for settling in</p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                {[
                                    { title: "Visa & Immigration", icon: "arrow-right" },
                                    { title: "Housing & Rentals", icon: "arrow-right" },
                                    { title: "Healthcare & Hospitals", icon: "arrow-right" },
                                    { title: "Banking & Finance", icon: "arrow-right" },
                                ].map((item) => (
                                    <button key={item.title} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors group">
                                        <span className="text-base font-medium text-foreground/80 group-hover:text-foreground">{item.title}</span>
                                        <svg className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                                    </button>
                                ))}
                            </div>

                            <button className="mt-4 text-blue-600 dark:text-blue-400 font-semibold text-sm flex items-center gap-2 hover:underline px-3 pb-2">
                                View all <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* Helpful Links Card */}
                    <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden transition-all hover:shadow-md">
                        <div className="p-6">
                            <div className="flex items-start gap-4 mb-4">
                                <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-7 h-7 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-foreground">Helpful Links</h3>
                                    <p className="text-sm text-muted-foreground">Curated resources for daily life</p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                {[
                                    { title: "Emergency Numbers", icon: "arrow-right" },
                                    { title: "Public Transport Routes", icon: "arrow-right" },
                                ].map((item) => (
                                    <button key={item.title} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors group">
                                        <span className="text-base font-medium text-foreground/80 group-hover:text-foreground">{item.title}</span>
                                        <svg className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Group Directory Card */}
                    <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden transition-all hover:shadow-md">
                        <div className="p-6">
                            <div className="flex items-start gap-4 mb-4">
                                <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-7 h-7 text-orange-600 dark:text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-foreground">Group Directory</h3>
                                    <p className="text-sm text-muted-foreground">Connect with local communities</p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                {[
                                    { title: "Expat Community", icon: "arrow-right" },
                                    { title: "Digital Nomads", icon: "arrow-right" },
                                    { title: "Language Exchange", icon: "arrow-right" },
                                ].map((item) => (
                                    <button key={item.title} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors group">
                                        <span className="text-base font-medium text-foreground/80 group-hover:text-foreground">{item.title}</span>
                                        <svg className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Services Card */}
                    <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden transition-all hover:shadow-md">
                        <div className="p-6">
                            <div className="flex items-start gap-4 mb-4">
                                <div className="w-14 h-14 rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-7 h-7 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-foreground">Services</h3>
                                    <p className="text-sm text-muted-foreground">Find trusted local professionals</p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                {[
                                    { title: "Home Maintenance", icon: "arrow-right" },
                                    { title: "Delivery Services", icon: "arrow-right" },
                                    { title: "Legal & Consulting", icon: "arrow-right" },
                                ].map((item) => (
                                    <button key={item.title} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors group">
                                        <span className="text-base font-medium text-foreground/80 group-hover:text-foreground">{item.title}</span>
                                        <svg className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
