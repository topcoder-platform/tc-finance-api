SELECT
    a.created_at                                   AS actioned_at,
    a.user_id                                      AS admin_user_id,
    am.handle                                      AS admin_handle,
    am.email                                       AS admin_email,
    NULLIF(TRIM(CONCAT_WS(' ', am."firstName", am."lastName")), '') AS admin_name,
    CASE
        WHEN a.action LIKE 'Modified payment status%'      THEN 'STATUS_CHANGE'
        WHEN a.action LIKE 'Modified payment amount%'      THEN 'AMOUNT_CHANGE'
        WHEN a.action LIKE 'Modified release date%'        THEN 'RELEASE_DATE_CHANGE'
        WHEN a.action LIKE 'Modified payment description%' THEN 'DESCRIPTION_CHANGE'
        ELSE 'OTHER'
    END                                            AS action_type,
    a.action,
    a.note                                         AS admin_note,
    w.winning_id,
    w.winner_id,
    wm.handle                                      AS winner_handle,
    w.type                                         AS winnings_type,
    w.category,
    w.title,
    w.external_id                                  AS challenge_or_external_id,
    p.payment_id,
    p.total_amount                                 AS current_total_amount,
    p.payment_status                               AS current_status,
    p.release_date,
    p.date_paid
FROM finance.audit a
JOIN finance.winnings w
       ON w.winning_id = a.winnings_id
LEFT JOIN finance.payment p
       ON p.winnings_id = a.winnings_id
      AND p.installment_number = 1
LEFT JOIN members.member am
       ON am."userId"::text = a.user_id
LEFT JOIN members.member wm
       ON wm."userId"::text = w.winner_id
WHERE a.created_at >= NOW() - INTERVAL '3 months'
ORDER BY a.created_at DESC;
