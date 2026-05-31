'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Sparkles } from 'lucide-react';

interface MatchedOpportunity {
  id: string;
  status: string;
  matched_at: string;
  buyer_profile_id: string;
  listing_id: string;
  buyer_profiles: {
    buyer_name: string;
    location: string | null;
  };
  vehicles: {
    address: string;
    bedrooms: number | null;
    bathrooms: number | null;
    price: number | null;
    photos: string[] | null;
  };
}

function formatPrice(price: number | null): string {
  if (!price) return 'Price N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

export function MatchedOpportunitiesCard() {
  const [opportunities, setOpportunities] = useState<MatchedOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        const res = await fetch('/api/matched-opportunities?status=new&limit=5');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setOpportunities(data);
      } catch (err) {
        console.error('Error fetching matched opportunities:', err);
        setError('Failed to load matched opportunities');
      } finally {
        setLoading(false);
      }
    };

    fetchOpportunities();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            New Matches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (error || opportunities.length === 0) {
    return null; // Don't show card if no matches
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            New Matches
          </span>
          <Badge variant="secondary">{opportunities.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {opportunities.map((opp) => (
          <div key={opp.id} className="rounded-lg border bg-white p-3">
            {/* Buyer & Listing header */}
            <div className="mb-2 space-y-1">
              <p className="text-sm font-semibold">
                {opp.buyer_profiles.buyer_name}
                {opp.buyer_profiles.location && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({opp.buyer_profiles.location})
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{opp.vehicles.address}</p>
            </div>

            {/* Listing details */}
            <div className="mb-3 flex items-baseline gap-4 text-sm">
              <span className="font-semibold text-emerald-600">
                {formatPrice(opp.vehicles.price)}
              </span>
              <span className="text-muted-foreground">
                {opp.vehicles.bedrooms}BR / {opp.vehicles.bathrooms}BA
              </span>
            </div>

            {/* Action button */}
            <Link href={`/listings/${opp.listing_id}`}>
              <Button size="sm" variant="outline" className="w-full">
                View & Send to Buyer
                <ArrowRight className="ml-2 h-3 w-3" />
              </Button>
            </Link>
          </div>
        ))}

        {opportunities.length > 0 && (
          <Link href="/buyer-criteria">
            <Button variant="ghost" className="w-full text-xs">
              View All Matches
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
