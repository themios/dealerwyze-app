'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

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
}

interface BuyerProfileFormProps {
  profile?: BuyerProfile;
  onSuccess: () => void;
  trigger?: React.ReactNode;
}

export function BuyerProfileForm({
  profile,
  onSuccess,
  trigger,
}: BuyerProfileFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    buyer_name: profile?.buyer_name || '',
    bedrooms_min: profile?.bedrooms_min || '',
    bedrooms_max: profile?.bedrooms_max || '',
    bathrooms_min: profile?.bathrooms_min || '',
    bathrooms_max: profile?.bathrooms_max || '',
    price_min: profile?.price_min || '',
    price_max: profile?.price_max || '',
    sqft_min: profile?.sqft_min || '',
    sqft_max: profile?.sqft_max || '',
    location: profile?.location || '',
    year_built_min: profile?.year_built_min || '',
    year_built_max: profile?.year_built_max || '',
    property_type: profile?.property_type || 'any',
    hoa_allowed: profile?.hoa_allowed ?? true,
    notes: profile?.notes || '',
  });

  // Validate range constraints
  const validateRanges = (): boolean => {
    const newErrors: Record<string, string> = {};

    const bedroomMin = formData.bedrooms_min ? parseInt(formData.bedrooms_min as string) : null;
    const bedroomMax = formData.bedrooms_max ? parseInt(formData.bedrooms_max as string) : null;
    if (bedroomMin !== null && bedroomMax !== null && bedroomMin > bedroomMax) {
      newErrors.bedrooms = 'Minimum must be less than or equal to maximum';
    }

    const bathroomMin = formData.bathrooms_min ? parseFloat(formData.bathrooms_min as string) : null;
    const bathroomMax = formData.bathrooms_max ? parseFloat(formData.bathrooms_max as string) : null;
    if (bathroomMin !== null && bathroomMax !== null && bathroomMin > bathroomMax) {
      newErrors.bathrooms = 'Minimum must be less than or equal to maximum';
    }

    const priceMin = formData.price_min ? parseInt(formData.price_min as string) : null;
    const priceMax = formData.price_max ? parseInt(formData.price_max as string) : null;
    if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
      newErrors.price = 'Minimum must be less than or equal to maximum';
    }

    const sqftMin = formData.sqft_min ? parseInt(formData.sqft_min as string) : null;
    const sqftMax = formData.sqft_max ? parseInt(formData.sqft_max as string) : null;
    if (sqftMin !== null && sqftMax !== null && sqftMin > sqftMax) {
      newErrors.sqft = 'Minimum must be less than or equal to maximum';
    }

    const yearMin = formData.year_built_min ? parseInt(formData.year_built_min as string) : null;
    const yearMax = formData.year_built_max ? parseInt(formData.year_built_max as string) : null;
    if (yearMin !== null && yearMax !== null && yearMin > yearMax) {
      newErrors.year_built = 'Minimum must be less than or equal to maximum';
    }

    setFieldErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.buyer_name.trim()) {
      setError('Buyer name is required');
      return;
    }

    if (!validateRanges()) {
      setError('Please fix the validation errors below');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        buyer_name: formData.buyer_name,
        bedrooms_min: formData.bedrooms_min ? parseInt(formData.bedrooms_min as string) : null,
        bedrooms_max: formData.bedrooms_max ? parseInt(formData.bedrooms_max as string) : null,
        bathrooms_min: formData.bathrooms_min ? parseFloat(formData.bathrooms_min as string) : null,
        bathrooms_max: formData.bathrooms_max ? parseFloat(formData.bathrooms_max as string) : null,
        price_min: formData.price_min ? parseInt(formData.price_min as string) : null,
        price_max: formData.price_max ? parseInt(formData.price_max as string) : null,
        sqft_min: formData.sqft_min ? parseInt(formData.sqft_min as string) : null,
        sqft_max: formData.sqft_max ? parseInt(formData.sqft_max as string) : null,
        location: formData.location || null,
        year_built_min: formData.year_built_min ? parseInt(formData.year_built_min as string) : null,
        year_built_max: formData.year_built_max ? parseInt(formData.year_built_max as string) : null,
        property_type: formData.property_type,
        hoa_allowed: formData.hoa_allowed,
        notes: formData.notes || null,
      };

      const url = profile
        ? `/api/buyer-profiles/${profile.id}`
        : '/api/buyer-profiles';

      const method = profile ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save profile');
      }

      const successMessage = profile
        ? `Updated ${formData.buyer_name}`
        : `Created ${formData.buyer_name}`;

      toast.success(successMessage);
      setOpen(false);
      onSuccess();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant={profile ? 'outline' : 'default'}>
            {profile ? 'Edit' : 'Add New Buyer'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{profile ? 'Edit Buyer Profile' : 'New Buyer Profile'}</DialogTitle>
          <DialogDescription>
            Save this buyer&apos;s search criteria to match new listings
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {/* Buyer Name - Required */}
          <div className="space-y-2">
            <Label htmlFor="buyer_name">
              Buyer Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="buyer_name"
              value={formData.buyer_name}
              onChange={(e) =>
                setFormData({ ...formData, buyer_name: e.target.value })
              }
              placeholder="e.g., John Smith"
              required
            />
            {!formData.buyer_name.trim() && (
              <p className="text-sm text-red-600">Buyer name is required</p>
            )}
          </div>

          {/* Bedrooms Range */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bedrooms_min">Min Bedrooms</Label>
              <Input
                id="bedrooms_min"
                type="number"
                value={formData.bedrooms_min}
                onChange={(e) =>
                  setFormData({ ...formData, bedrooms_min: e.target.value })
                }
                placeholder="e.g., 2"
                min="0"
                className={fieldErrors.bedrooms ? 'border-red-500' : ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bedrooms_max">Max Bedrooms</Label>
              <Input
                id="bedrooms_max"
                type="number"
                value={formData.bedrooms_max}
                onChange={(e) =>
                  setFormData({ ...formData, bedrooms_max: e.target.value })
                }
                placeholder="e.g., 4"
                min="0"
                className={fieldErrors.bedrooms ? 'border-red-500' : ''}
              />
            </div>
          </div>
          {fieldErrors.bedrooms && (
            <p className="text-sm text-red-600">{fieldErrors.bedrooms}</p>
          )}

          {/* Bathrooms Range */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bathrooms_min">Min Bathrooms</Label>
              <Input
                id="bathrooms_min"
                type="number"
                step="0.5"
                value={formData.bathrooms_min}
                onChange={(e) =>
                  setFormData({ ...formData, bathrooms_min: e.target.value })
                }
                placeholder="e.g., 1.5"
                min="0"
                className={fieldErrors.bathrooms ? 'border-red-500' : ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bathrooms_max">Max Bathrooms</Label>
              <Input
                id="bathrooms_max"
                type="number"
                step="0.5"
                value={formData.bathrooms_max}
                onChange={(e) =>
                  setFormData({ ...formData, bathrooms_max: e.target.value })
                }
                placeholder="e.g., 3"
                min="0"
                className={fieldErrors.bathrooms ? 'border-red-500' : ''}
              />
            </div>
          </div>
          {fieldErrors.bathrooms && (
            <p className="text-sm text-red-600">{fieldErrors.bathrooms}</p>
          )}

          {/* Price Range */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price_min">Min Price</Label>
              <Input
                id="price_min"
                type="number"
                value={formData.price_min}
                onChange={(e) =>
                  setFormData({ ...formData, price_min: e.target.value })
                }
                placeholder="e.g., 500000"
                min="0"
                className={fieldErrors.price ? 'border-red-500' : ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price_max">Max Price</Label>
              <Input
                id="price_max"
                type="number"
                value={formData.price_max}
                onChange={(e) =>
                  setFormData({ ...formData, price_max: e.target.value })
                }
                placeholder="e.g., 1100000"
                min="0"
                className={fieldErrors.price ? 'border-red-500' : ''}
              />
            </div>
          </div>
          {fieldErrors.price && (
            <p className="text-sm text-red-600">{fieldErrors.price}</p>
          )}

          {/* Sqft Range (Optional) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sqft_min">Min Sqft (optional)</Label>
              <Input
                id="sqft_min"
                type="number"
                value={formData.sqft_min}
                onChange={(e) =>
                  setFormData({ ...formData, sqft_min: e.target.value })
                }
                placeholder="e.g., 1500"
                min="0"
                className={fieldErrors.sqft ? 'border-red-500' : ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sqft_max">Max Sqft (optional)</Label>
              <Input
                id="sqft_max"
                type="number"
                value={formData.sqft_max}
                onChange={(e) =>
                  setFormData({ ...formData, sqft_max: e.target.value })
                }
                placeholder="e.g., 3000"
                min="0"
                className={fieldErrors.sqft ? 'border-red-500' : ''}
              />
            </div>
          </div>
          {fieldErrors.sqft && (
            <p className="text-sm text-red-600">{fieldErrors.sqft}</p>
          )}

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">Location (optional)</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) =>
                setFormData({ ...formData, location: e.target.value })
              }
              placeholder="e.g., West Pasadena or 90210"
            />
          </div>

          {/* Year Built Range (Optional) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="year_built_min">Min Year Built (optional)</Label>
              <Input
                id="year_built_min"
                type="number"
                value={formData.year_built_min}
                onChange={(e) =>
                  setFormData({ ...formData, year_built_min: e.target.value })
                }
                placeholder="e.g., 1970"
                min="1800"
                className={fieldErrors.year_built ? 'border-red-500' : ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year_built_max">Max Year Built (optional)</Label>
              <Input
                id="year_built_max"
                type="number"
                value={formData.year_built_max}
                onChange={(e) =>
                  setFormData({ ...formData, year_built_max: e.target.value })
                }
                placeholder="e.g., 2010"
                min="1800"
                className={fieldErrors.year_built ? 'border-red-500' : ''}
              />
            </div>
          </div>
          {fieldErrors.year_built && (
            <p className="text-sm text-red-600">{fieldErrors.year_built}</p>
          )}

          {/* Property Type */}
          <div className="space-y-2">
            <Label htmlFor="property_type">Property Type</Label>
            <Select
              value={formData.property_type}
              onValueChange={(value) =>
                setFormData({ ...formData, property_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="single_family">Single Family</SelectItem>
                <SelectItem value="condo">Condo</SelectItem>
                <SelectItem value="townhouse">Townhouse</SelectItem>
                <SelectItem value="multi_family">Multi-Family</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* HOA Allowed */}
          <div className="flex items-center justify-between rounded border p-3">
            <Label htmlFor="hoa_allowed">OK with HOA</Label>
            <Switch
              id="hoa_allowed"
              checked={formData.hoa_allowed}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, hoa_allowed: checked })
              }
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              placeholder="e.g., Prefers pool, close to schools"
              className="h-20"
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Buyer Profile'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
