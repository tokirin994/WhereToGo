package com.travelatlas.trips;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TripService {
    private final TripMapper mapper;
    public TripService(TripMapper mapper) { this.mapper = mapper; }

    public List<TripDto> findAll() { return mapper.findAll(); }

    public TripDto find(UUID id) {
        TripDto trip = mapper.findById(id);
        if (trip == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "行程不存在");
        return trip;
    }

    @Transactional
    public TripDto create(TripRequest request) {
        validateDates(request.getStartsOn(), request.getEndsOn());
        UUID id = UUID.randomUUID();
        mapper.insert(id, request);
        return find(id);
    }

    @Transactional
    public TripDto update(UUID id, TripRequest request) {
        validateDates(request.getStartsOn(), request.getEndsOn());
        if (mapper.countStopsOutsideRange(id, request) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "调整日期范围前，请先移动超出范围的日程点");
        }
        if (mapper.update(id, request) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "行程不存在");
        return find(id);
    }

    @Transactional
    public TripDto replaceStops(UUID tripId, List<TripStopRequest> stops) {
        find(tripId);
        LocalDate start = mapper.findById(tripId).getStartsOn();
        LocalDate end = mapper.findById(tripId).getEndsOn();
        if (stops.size() > 300) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "单次最多保存 300 个日程点");
        for (TripStopRequest stop : stops) {
            if (start != null && stop.getDayDate().isBefore(start) || end != null && stop.getDayDate().isAfter(end)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "日程日期必须位于行程日期范围内");
            }
            if (stop.getStartsAt() == null) stop.setStartsAt("09:00");
            if (stop.getDurationMinutes() == null) stop.setDurationMinutes(60);
            if (stop.getCategory() == null) stop.setCategory("");
        }
        mapper.deleteStops(tripId);
        if (!stops.isEmpty()) {
            for (TripStopRequest stop : stops) if (stop.getId() == null) stop.setId(UUID.randomUUID());
            mapper.insertStops(tripId, stops);
        }
        return find(tripId);
    }

    @Transactional
    public void delete(UUID id) {
        if (mapper.softDelete(id) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "行程不存在");
    }

    private void validateDates(LocalDate start, LocalDate end) {
        if (start != null && end != null && start.isAfter(end)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "结束日期不能早于开始日期");
        }
    }
}
