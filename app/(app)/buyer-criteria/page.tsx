'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BuyerProfileForm } from '@/components/BuyerProfileForm';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BuyerProfile {
  id: string;
  buyer_name: string;
  bedrooms_min: number | null;
  bedrooms_max: number | null;
  bathrooms_min: number | null;
  bathrooms_max: number | null;
  price_min: number | null;
  price_max: number | null;
  sqft_min: number | null;
  sqft_max: number | null;
  location: string | null;
  year_built_min: number | null;
  year_built_max: number | null;
  property_type: string;
  hoa_allowed: boolean;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function formatPrice(price: number | null): string {
  if (!price) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatRange(min: number | null, max: number | null): string {
  const parts = [];
  if (min !== null) parts.push(min.toString());
  if (max !== null) parts.push(max.toString());
  return parts.length > 0 ? parts.join(' - ') : 'Any';
}

export default function BuyerCriteriaPage() {
  const [profiles, setProfiles] = useState<BuyerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchProfiles = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/buyer-profiles');
        if (!res.ok) throw new Error('Failed to fetch profiles');
        const data = await res.json();
        setProfiles(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, [refreshKey]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/buyer-profiles/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete profile');
      setProfiles(profiles.filter((p) => p.id !== id));
      setDeleteId(null);
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleSuccess = () => {
    setRefreshKey((prev) => prev + 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading buyer profiles...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold">Buyer Criteria</h1>
          <p className="mt-1 text-muted-foreground">
            Save buyer profiles and automatically match them to new listings
          </p>
        </div>
        <BuyerProfileForm onSuccess={handleSuccess} />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty State */}
      {profiles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-4 text-muted-foreground">
              No buyer profiles yet. Create one to get started.
            </p>
            <BuyerProfileForm onSuccess={handleSuccess} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <Card key={profile.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{profile.buyer_name}</CardTitle>
                    {profile.location && (
                      <p className="text-sm text-muted-foreground">
                        {profile.location}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <BuyerProfileForm
                          profile={profile}
                          onSuccess={handleSuccess}
                          trigger={
                            <div className="cursor-pointer px-2 py-1.5">
                              Edit
                            </div>
                          }
                        />
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => setDeleteId(profile.id)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-3">
                {/* Bedrooms */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Bedrooms</p>
                    <p className="font-medium">
                      {formatRange(profile.bedrooms_min, profile.bedrooms_max)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bathrooms</p>
                    <p className="font-medium">
                      {formatRange(profile.bathrooms_min, profile.bathrooms_max)}
                    </p>
                  </div>
                </div>

                {/* Price */}
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <div className="text-sm font-medium">
                    {profile.price_min || profile.price_max ? (
                      <>
                        {formatPrice(profile.price_min)} —{' '}
                        {formatPrice(profile.price_max)}
                      </>
                    ) : (
                      'Any'
                    )}
                  </div>
                </div>

                {/* Sqft */}
                {(profile.sqft_min || profile.sqft_max) && (
                  <div>
                    <p className="text-sm text-muted-foreground">Sqft</p>
                    <p className="text-sm font-medium">
                      {formatRange(profile.sqft_min, profile.sqft_max)}
                    </p>
                  </div>
                )}

                {/* Year Built */}
                {(profile.year_built_min || profile.year_built_max) && (
                  <div>
                    <p className="text-sm text-muted-foreground">Year Built</p>
                    <p className="text-sm font-medium">
                      {formatRange(profile.year_built_min, profile.year_built_max)}
                    </p>
                  </div>
                )}

                {/* Property Type */}
                <div>
                  <p className="text-sm text-muted-foreground">Property Type</p>
                  <p className="text-sm font-medium capitalize">
                    {profile.property_type.replace(/_/g, ' ')}
                  </p>
                </div>

                {/* HOA */}
                <div>
                  <p className="text-sm text-muted-foreground">HOA</p>
                  <p className="text-sm font-medium">
                    {profile.hoa_allowed ? 'Allowed' : 'No HOA'}
                  </p>
                </div>

                {/* Notes */}
                {profile.notes && (
                  <div className="border-t pt-3">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm italic">{profile.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Buyer Profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The profile and all matched opportunities
              will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteId && handleDelete(deleteId)}
            className="bg-red-600 hover:bg-red-700"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
