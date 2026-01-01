import Link from "next/link";
import { TrendingUp, Clock, ShieldCheck, MessageSquare } from 'lucide-react';

interface CallCardProps {
    call: any;
}

export function CallCard({ call }: CallCardProps) {
    return (
        <Link href={`/calls/${call.id}`} className="block group">
            <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center font-bold text-white text-xs`}>
                            {(call.creator?.displayName || "U").substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div className="font-bold text-sm group-hover:text-primary transition-colors">{call.creator?.displayName || call.creator?.wallet?.slice(0, 6) || "Unknown User"}</div>
                            <div className="text-xs text-muted-foreground">{new Date(call.createdAt).toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div className="px-2 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-bold border border-green-500/20">
                        {call.status}
                    </div>
                </div>

                <h3 className="text-lg font-bold mb-2 leading-snug">{call.conditionJson?.title || call.title || "Untitled Call"}</h3>

                <div className="flex flex-wrap gap-3 mb-4">
                    <Badge icon={<TrendingUp className="h-3 w-3" />} label={`${call.stakeToken} Pool`} />
                    <Badge icon={<Clock className="h-3 w-3" />} label={new Date(call.endTs).toLocaleDateString()} />
                    <Badge icon={<ShieldCheck className="h-3 w-3" />} label={`Pool: ${parseFloat(call.totalStakeYes || 0) + parseFloat(call.totalStakeNo || 0)}`} />
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                    <div className="flex gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <span className="font-bold text-green-500">{call.totalStakeYes || 0}</span> YES
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="font-bold text-red-500">{call.totalStakeNo || 0}</span> NO
                        </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                        <MessageSquare className="h-3 w-3" />
                        {call.comments || 0} Comments
                    </div>
                </div>
            </div>
        </Link>
    );
}

function Badge({ icon, label }: { icon: React.ReactNode, label: string }) {
    return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/50 text-xs font-medium text-muted-foreground border border-border">
            {icon}
            {label}
        </div>
    );
}
