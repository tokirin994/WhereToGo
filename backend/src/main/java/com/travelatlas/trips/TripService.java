package com.travelatlas.trips;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import com.travelatlas.security.CurrentUser;
import com.travelatlas.places.PlaceMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TripService {
    private final TripMapper mapper;
    private final CurrentUser currentUser;
    private final PlaceMapper places;
    public TripService(TripMapper mapper,CurrentUser currentUser,PlaceMapper places) { this.mapper = mapper; this.currentUser=currentUser; this.places=places; }

    public List<TripDto> findAll() { return mapper.findAll(currentUser.id()); }

    public TripDto find(UUID id) {
        TripDto trip = mapper.findById(id, currentUser.id());
        if (trip == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "行程不存在");
        return trip;
    }

    @Transactional
    public TripDto create(TripRequest request) {
        validateDates(request.getStartsOn(), request.getEndsOn());
        UUID id = UUID.randomUUID();
        mapper.insert(id, request, currentUser.id());
        return find(id);
    }

    @Transactional
    public TripDto update(UUID id, TripRequest request) {
        validateDates(request.getStartsOn(), request.getEndsOn());
        TripDto previous=find(id);
        if(request.isShiftStops()&&previous.getStartsOn()!=null&&request.getStartsOn()!=null&&!previous.getStartsOn().equals(request.getStartsOn())) {
            int days=(int)java.time.temporal.ChronoUnit.DAYS.between(previous.getStartsOn(),request.getStartsOn());
            mapper.shiftStops(id,days,currentUser.id());
        }
        if ((request.getStartsOn()!=null||request.getEndsOn()!=null)&&mapper.countStopsOutsideRange(id, request, currentUser.id()) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "调整日期范围前，请先移动超出范围的日程点");
        }
        if (mapper.update(id, request, currentUser.id()) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "行程不存在");
        return find(id);
    }

    @Transactional
    public TripDto replaceStops(UUID tripId, List<TripStopRequest> stops) {
        TripDto trip=find(tripId);
        LocalDate start = trip.getStartsOn();
        LocalDate end = trip.getEndsOn();
        if (stops.size() > 300) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "单次最多保存 300 个日程点");
        for (TripStopRequest stop : stops) {
            if(stop==null||stop.getDayDate()==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"日程点和日期不能为空");
            if(stop.getPlaceId()!=null&&places.findById(stop.getPlaceId(),currentUser.id())==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"日程地点不存在或不属于当前账号");
            if (start != null && stop.getDayDate().isBefore(start) || end != null && stop.getDayDate().isAfter(end)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "日程日期必须位于行程日期范围内");
            }
            if (stop.getStartsAt() == null) stop.setStartsAt("09:00");
            if (stop.getDurationMinutes() == null) stop.setDurationMinutes(60);
            if (stop.getCategory() == null) stop.setCategory("");
        }
        java.util.Set<UUID> previousIds=new java.util.HashSet<>();
        if(trip.getStops()!=null)for(TripStopDto item:trip.getStops())previousIds.add(item.getId());
        java.util.Set<UUID> usedIds=new java.util.HashSet<>();
        mapper.deleteStops(tripId, currentUser.id());
        if (!stops.isEmpty()) {
            for (TripStopRequest stop : stops) {
                UUID requested=stop.getId();
                stop.setId(requested!=null&&previousIds.contains(requested)&&usedIds.add(requested)?requested:UUID.randomUUID());
            }
            mapper.insertStops(tripId, stops, currentUser.id());
        }
        return find(tripId);
    }

    @Transactional
    public void delete(UUID id) {
        if (mapper.softDelete(id, currentUser.id()) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "行程不存在");
    }

    @Transactional
    public TripDto duplicate(UUID id) {
        TripDto original=find(id);
        TripRequest request=new TripRequest();
        String name=original.getName();
        request.setName((name.length()>174?name.substring(0,174):name)+" · 副本");
        request.setDestination(original.getDestination());request.setStartsOn(original.getStartsOn());request.setEndsOn(original.getEndsOn());
        request.setNotes(original.getNotes());request.setPreferences(original.getPreferences());request.setStatus("planning");
        if(request.getPreferences()!=null&&request.getPreferences().getChecklist()!=null)request.getPreferences().getChecklist().forEach(item->item.setDone(false));
        TripDto copy=create(request);
        java.util.ArrayList<TripStopRequest> stops=new java.util.ArrayList<>();
        for(TripStopDto source:original.getStops()){
            TripStopRequest stop=new TripStopRequest();
            stop.setPlaceId(source.getPlaceId()!=null&&places.findById(source.getPlaceId(),currentUser.id())!=null?source.getPlaceId():null);
            stop.setDayDate(source.getDayDate());stop.setPlaceName(source.getPlaceName());stop.setCategory(source.getCategory());stop.setStartsAt(source.getStartsAt());
            stop.setDurationMinutes(source.getDurationMinutes());stop.setNote(source.getNote());stop.setSortOrder(source.getSortOrder());stop.setEstimatedCost(source.getEstimatedCost());
            stops.add(stop);
        }
        return replaceStops(copy.getId(),stops);
    }

    private void validateDates(LocalDate start, LocalDate end) {
        if(start!=null&&(start.getYear()<1000||start.getYear()>9999)||end!=null&&(end.getYear()<1000||end.getYear()>9999)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请选择有效的四位年份");
        }
        if (start != null && end != null && start.isAfter(end)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "结束日期不能早于开始日期");
        }
        if(start!=null&&end!=null&&java.time.temporal.ChronoUnit.DAYS.between(start,end)>59) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"每趟行程最多 60 天，请拆分为多趟旅行");
        }
    }
}
