'use client';

import * as React from 'react';
import { useFollow, type UseFollowOptions } from '../../hooks/useFollow';

export interface FollowButtonProps extends UseFollowOptions {
  profileAddress: string;
  viewerAddress?: string;
}

/**
 * Follow / unfollow toggle with an optimistic state (FE-08).
 *
 * The label flips immediately and reverts if the request fails. A toggle that
 * waits for a round trip reads as broken, and this is the case optimism is
 * for: the user has already decided and the server will almost always agree.
 */
export function FollowButton({ profileAddress, viewerAddress, ...options }: FollowButtonProps) {
  const { isFollowing, toggle, isMutating, isLoading, lastMutationError } = useFollow(
    profileAddress,
    viewerAddress,
    options,
  );

  // Following yourself is not a meaningful action, and the backend would
  // reject it — better not to offer it.
  const isSelf =
    Boolean(viewerAddress) &&
    viewerAddress?.toLowerCase() === profileAddress.toLowerCase();

  if (isSelf) return null;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        data-testid="follow-button"
        aria-pressed={isFollowing}
        disabled={isLoading || isMutating || !viewerAddress}
        onClick={toggle}
        className={
          isFollowing
            ? 'rounded-full border px-4 py-1.5 text-sm'
            : 'rounded-full bg-black px-4 py-1.5 text-sm text-white'
        }
      >
        {isFollowing ? 'Following' : 'Follow'}
      </button>

      {!viewerAddress ? (
        <span data-testid="follow-needs-wallet" className="text-xs text-gray-500">
          Connect a wallet to follow
        </span>
      ) : null}

      {lastMutationError ? (
        <span role="alert" data-testid="follow-error" className="text-xs text-red-600">
          {lastMutationError.message}
        </span>
      ) : null}
    </div>
  );
}

export default FollowButton;
